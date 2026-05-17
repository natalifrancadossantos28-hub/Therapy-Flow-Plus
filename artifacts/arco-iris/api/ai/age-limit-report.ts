import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyId, getSupabase, getModel, calcAge, todayStr, parseAIResponse, cors } from "./_helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const sb = getSupabase();

    const { data: patientsData } = await sb
      .from("patients")
      .select("id, name, date_of_birth, status, entry_date")
      .eq("company_id", companyId)
      .in("status", ["Em Atendimento", "Fila de Espera"]);

    const patients = patientsData ?? [];

    // Get specialties per patient from appointments
    const patientIds = patients.map((p: any) => p.id);
    const { data: apptsData } = patientIds.length > 0
      ? await sb.from("appointments").select("patient_id, professional_id").eq("company_id", companyId).in("patient_id", patientIds)
      : { data: [] };
    const appts = apptsData ?? [];

    const profIds = [...new Set(appts.map((a: any) => a.professional_id).filter(Boolean))];
    const { data: profsData } = profIds.length > 0
      ? await sb.from("professionals").select("id, specialty").in("id", profIds)
      : { data: [] };
    const profs = profsData ?? [];
    const profMap = new Map(profs.map((p: any) => [p.id, p]));

    const patientSpecs = new Map<number, Set<string>>();
    for (const a of appts) {
      if (!a.patient_id) continue;
      const prof = profMap.get(a.professional_id);
      if (!prof?.specialty) continue;
      const set = patientSpecs.get(a.patient_id) ?? new Set();
      set.add(prof.specialty);
      patientSpecs.set(a.patient_id, set);
    }

    const patientData = patients
      .map((p: any) => ({
        nome: p.name,
        dataNascimento: p.date_of_birth,
        idade: calcAge(p.date_of_birth),
        status: p.status,
        especialidades: [...(patientSpecs.get(p.id) ?? [])],
        dataEntrada: p.entry_date,
      }))
      .filter((p) => p.idade !== null);

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil brasileira (atende crianças e adolescentes até 18 anos). Analise os pacientes e gere relatórios de limite de idade.

PACIENTES (${patientData.length}):
${JSON.stringify(patientData, null, 2)}

DATA DE HOJE: ${todayStr()}

Responda em formato JSON com esta estrutura exata:
{
  "resumo": "Resumo sobre a situação etária dos pacientes",
  "proximosDoLimite": [
    {"paciente": "nome", "idade": 17, "dataNascimento": "YYYY-MM-DD", "completaIdade": "data que completa 18", "mesesRestantes": 6, "especialidades": ["Fono", "TO"], "recomendacao": "ação sugerida"}
  ],
  "foraDoLimite": [
    {"paciente": "nome", "idade": 19, "recomendacao": "encaminhar para serviço adulto de X"}
  ],
  "faixasEtarias": {
    "bebes_0_2": 0,
    "infancia1_3_6": 0,
    "infancia2_7_10": 0,
    "adolescentes_11_17": 0,
    "adultos_18_mais": 0
  },
  "alertas": [
    {"tipo": "urgente|atencao", "mensagem": "descrição"}
  ]
}

Considere:
- Pacientes com 17+ anos precisam de plano de transição
- Pacientes com 18+ anos precisam de encaminhamento para serviço adulto
- Pacientes entre 15-17 que fazem Psicopedagogia podem precisar de transição escolar
Responda APENAS com o JSON, sem markdown.`;

    const result = await model.generateContent(prompt);
    const parsed = parseAIResponse(result.response.text());

    res.json({ success: true, analysis: parsed, totalPatients: patientData.length });
  } catch (err: any) {
    console.error("[AI] age-limit-report error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
}
