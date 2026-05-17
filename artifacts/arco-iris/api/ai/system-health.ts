import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyId, getSupabase, getModel, parseAIResponse, cors } from "./_helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const sb = getSupabase();

    // 1. Patients "Em Atendimento" without appointments
    const { data: emAtendimento } = await sb
      .from("patients")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("status", "Em Atendimento");

    const orphanPatients: Array<{ nome: string; issue: string }> = [];
    for (const p of emAtendimento ?? []) {
      const { count } = await sb
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", p.id)
        .eq("company_id", companyId);
      if ((count ?? 0) === 0) {
        orphanPatients.push({ nome: p.name, issue: "Em Atendimento sem agendamentos" });
      }
    }

    // 2. Patients in queue AND in treatment
    const { data: waitingData } = await sb
      .from("waiting_list")
      .select("patient_id, specialty")
      .eq("company_id", companyId);

    const waitingPatientIds = [...new Set((waitingData ?? []).map((w: any) => w.patient_id).filter(Boolean))];
    const { data: inTreatmentData } = waitingPatientIds.length > 0
      ? await sb.from("patients").select("id, name, status").in("id", waitingPatientIds).eq("status", "Em Atendimento")
      : { data: [] };

    const filaAndAtendimento = (inTreatmentData ?? []).map((p: any) => {
      const specs = (waitingData ?? []).filter((w: any) => w.patient_id === p.id).map((w: any) => w.specialty);
      return {
        nome: p.name,
        especialidadeNaFila: specs.join(", "),
        issue: "Na fila de espera E em atendimento simultaneamente",
      };
    });

    // 3. Patients with exit status still in queue
    const { data: exitedData } = waitingPatientIds.length > 0
      ? await sb.from("patients").select("id, name, status").in("id", waitingPatientIds).in("status", ["Alta", "Óbito", "Desistência"])
      : { data: [] };

    const statusInconsistencies = (exitedData ?? []).map((p: any) => {
      const specs = (waitingData ?? []).filter((w: any) => w.patient_id === p.id).map((w: any) => w.specialty);
      return {
        nome: p.name,
        status: p.status,
        issue: `Paciente com status "${p.status}" ainda na fila de ${specs.join(", ")}`,
      };
    });

    // 4. Duplicate patients
    const { data: allPatients } = await sb
      .from("patients")
      .select("name")
      .eq("company_id", companyId);

    const nameCounts = new Map<string, number>();
    for (const p of allPatients ?? []) {
      const lower = (p.name ?? "").toLowerCase().trim();
      nameCounts.set(lower, (nameCounts.get(lower) ?? 0) + 1);
    }
    const duplicates = [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => ({ nome: name, quantidade: count, issue: "Possível cadastro duplicado" }));

    const healthData = {
      orphanPatients,
      filaAndAtendimento,
      statusInconsistencies,
      duplicates,
    };

    const totalIssues =
      orphanPatients.length +
      filaAndAtendimento.length +
      statusInconsistencies.length +
      duplicates.length;

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil. Analise as inconsistências detectadas no sistema e sugira correções.

INCONSISTÊNCIAS DETECTADAS (${totalIssues} total):
${JSON.stringify(healthData, null, 2)}

Responda em formato JSON com esta estrutura exata:
{
  "resumo": "Resumo da saúde do sistema em 2-3 frases",
  "saude": "otimo|bom|atencao|critico",
  "problemas": [
    {"severidade": "critico|alerta|info", "categoria": "fantasma|duplicata|status|orfao", "descricao": "o que está errado", "correcao": "como corrigir", "paciente": "nome se aplicável"}
  ],
  "metricas": {
    "totalProblemas": 0,
    "criticos": 0,
    "alertas": 0,
    "infos": 0
  },
  "recomendacoes": ["lista de ações recomendadas em ordem de prioridade"]
}

Priorize problemas que afetam o atendimento do paciente. Fantasmas e status inconsistentes são mais urgentes que duplicatas de nome.
Responda APENAS com o JSON, sem markdown.`;

    const result = await model.generateContent(prompt);
    const parsed = parseAIResponse(result.response.text());

    res.json({ success: true, analysis: parsed, rawIssues: totalIssues });
  } catch (err: any) {
    console.error("[AI] system-health error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
}
