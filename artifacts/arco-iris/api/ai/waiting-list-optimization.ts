import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyId, getSupabase, getModel, calcAge, parseAIResponse, cors } from "./_helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const sb = getSupabase();

    const [waitingRes, profRes] = await Promise.all([
      sb.from("waiting_list").select("id, patient_id, specialty, priority, entry_date").eq("company_id", companyId),
      sb.from("professionals").select("id, name, specialty, carga_horaria").eq("company_id", companyId),
    ]);

    const waitingRows = waitingRes.data ?? [];
    const professionals = profRes.data ?? [];

    // Get patient details for waiting list entries
    const patientIds = [...new Set(waitingRows.map((w: any) => w.patient_id).filter(Boolean))];
    const { data: patientsData } = patientIds.length > 0
      ? await sb.from("patients").select("id, name, date_of_birth, triagem_score, escola_publica, abrigo_casa_crianca").in("id", patientIds)
      : { data: [] };
    const patients = patientsData ?? [];
    const patientMap = new Map(patients.map((p: any) => [p.id, p]));

    // Count active patients per professional
    const profCapacity = await Promise.all(
      professionals.map(async (p: any) => {
        const { count } = await sb
          .from("appointments")
          .select("patient_id", { count: "exact", head: true })
          .eq("professional_id", p.id)
          .eq("company_id", companyId);
        return {
          name: p.name,
          specialty: p.specialty,
          cargaHoraria: p.carga_horaria,
          pacientesAtivos: count ?? 0,
        };
      })
    );

    const waitingData = waitingRows.map((w: any) => {
      const pat = patientMap.get(w.patient_id);
      return {
        paciente: pat?.name ?? "Desconhecido",
        idade: calcAge(pat?.date_of_birth),
        especialidade: w.specialty,
        prioridade: w.priority,
        dataEntrada: w.entry_date,
        triagemScore: pat?.triagem_score,
        abrigo: pat?.abrigo_casa_crianca,
        escolaPublica: pat?.escola_publica,
      };
    });

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil brasileira. Analise a fila de espera e sugira otimizações.

FILA DE ESPERA ATUAL (${waitingData.length} pacientes):
${JSON.stringify(waitingData, null, 2)}

CAPACIDADE DOS PROFISSIONAIS:
${JSON.stringify(profCapacity, null, 2)}

Responda em formato JSON com esta estrutura exata:
{
  "resumo": "Resumo de 2-3 frases do estado da fila",
  "alertas": [
    {"tipo": "urgente|atencao|info", "mensagem": "descrição do alerta"}
  ],
  "sugestoes": [
    {"paciente": "nome", "acao": "descrição da sugestão", "motivo": "justificativa clínica"}
  ],
  "metricas": {
    "tempoMedioEspera": "X dias",
    "especialidadeMaisDemandada": "nome",
    "pacientesUrgentes": 0
  }
}

Considere: prioridade clínica, tempo de espera, idade do paciente (crianças < 5 anos têm prioridade máxima), pacientes de abrigo têm prioridade máxima, capacidade disponível dos profissionais.
Responda APENAS com o JSON, sem markdown.`;

    const result = await model.generateContent(prompt);
    const parsed = parseAIResponse(result.response.text());

    res.json({ success: true, analysis: parsed, rawPatientCount: waitingData.length });
  } catch (err: any) {
    console.error("[AI] waiting-list-optimization error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
}
