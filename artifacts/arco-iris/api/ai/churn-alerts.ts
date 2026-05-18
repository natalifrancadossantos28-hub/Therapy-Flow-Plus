import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyId, getSupabase, getModel, calcAge, todayStr, parseAIResponse, cors } from "./_helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const sb = getSupabase();
    const today = todayStr();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyStr = ninetyDaysAgo.toISOString().split("T")[0];

    const [patientsRes, apptsRes] = await Promise.all([
      sb.from("patients")
        .select("id, name, status, date_of_birth, phone, entry_date")
        .eq("company_id", companyId)
        .in("status", ["Em Atendimento", "Fila de Espera", "Aguardando Triagem"]),
      sb.from("appointments")
        .select("patient_id, date, status, professional_id")
        .eq("company_id", companyId)
        .gte("date", ninetyStr),
    ]);

    const activePatients = patientsRes.data ?? [];
    const recentAppts = apptsRes.data ?? [];

    // Get professional names
    const profIds = [...new Set(recentAppts.map((a: any) => a.professional_id).filter(Boolean))];
    const { data: profsData } = profIds.length > 0
      ? await sb.from("professionals").select("id, name, specialty").in("id", profIds)
      : { data: [] };
    const profs = profsData ?? [];
    const profMap = new Map<number, any>(profs.map((p: any) => [p.id, p]));

    const patientAppts = new Map<number, any[]>();
    for (const a of recentAppts) {
      if (!a.patient_id) continue;
      const arr = patientAppts.get(a.patient_id) ?? [];
      arr.push(a);
      patientAppts.set(a.patient_id, arr);
    }

    const patientData = activePatients.map((p: any) => {
      const appts = patientAppts.get(p.id) ?? [];
      const faltas = appts.filter((a: any) => a.status === "Falta").length;
      const presencas = appts.filter((a: any) =>
        ["Presente", "Confirmado", "Em Espera"].includes(a.status ?? "")
      ).length;
      const ultimaPresenca = appts
        .filter((a: any) => a.status === "Presente")
        .sort((a: any, b: any) => (b.date ?? "").localeCompare(a.date ?? ""))
        [0]?.date ?? null;

      const profNames = [...new Set(appts.map((a: any) => {
        const prof = profMap.get(a.professional_id);
        return prof ? `${prof.specialty}: ${prof.name}` : null;
      }).filter(Boolean))];

      return {
        nome: p.name,
        status: p.status,
        idade: calcAge(p.date_of_birth),
        dataEntrada: p.entry_date,
        totalAgendamentos: appts.length,
        faltas,
        presencas,
        taxaPresenca: appts.length > 0 ? Math.round((presencas / appts.length) * 100) : 0,
        ultimaPresenca,
        profissionais: profNames,
      };
    });

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil. Analise os dados de frequência dos pacientes e identifique riscos de evasão (churn).

PACIENTES ATIVOS (${patientData.length}):
${JSON.stringify(patientData, null, 2)}

DATA DE HOJE: ${today}

Responda em formato JSON com esta estrutura exata:
{
  "resumo": "Resumo de 2-3 frases sobre o estado de retenção",
  "riscoAlto": [
    {"paciente": "nome", "motivo": "por que está em risco", "sugestao": "ação recomendada", "indicadores": "faltas: X, última presença: data"}
  ],
  "riscoModerado": [
    {"paciente": "nome", "motivo": "por que está em risco moderado", "sugestao": "ação recomendada"}
  ],
  "metricas": {
    "taxaPresencaMedia": "X%",
    "pacientesEmRisco": 0,
    "pacientesSemAgendamento30dias": 0
  }
}

Critérios de risco:
- ALTO: 3+ faltas com mesmo profissional, ou sem presença há 30+ dias, ou taxa < 50%
- MODERADO: 2 faltas consecutivas, ou taxa 50-70%, ou sem agendamento há 15-30 dias
Responda APENAS com o JSON, sem markdown.`;

    const result = await model.generateContent(prompt);
    const parsed = parseAIResponse(result.response.text());

    res.json({ success: true, analysis: parsed, totalPatients: patientData.length });
  } catch (err: any) {
    console.error("[AI] churn-alerts error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
}
