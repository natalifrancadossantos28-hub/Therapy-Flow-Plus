import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyId, getSupabase, getModel, calcAge, todayStr, parseAIResponse, cors } from "./_helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const sb = getSupabase();

    const [patientsRes, waitingRes, profRes] = await Promise.all([
      sb.from("patients").select("*").eq("company_id", companyId),
      sb.from("waiting_list").select("id, patient_id, specialty, priority, entry_date").eq("company_id", companyId),
      sb.from("professionals").select("*").eq("company_id", companyId),
    ]);

    const patients = patientsRes.data ?? [];
    const waiting = waitingRes.data ?? [];
    const professionals = profRes.data ?? [];

    const today = todayStr();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split("T")[0];

    const { data: recentAppts } = await sb
      .from("appointments")
      .select("patient_id, status, date")
      .eq("company_id", companyId)
      .gte("date", thirtyStr);

    const appts = recentAppts ?? [];
    const activePatients = patients.filter((p: any) =>
      ["Em Atendimento", "Fila de Espera"].includes(p.status ?? "")
    );
    const agingPatients = patients.filter((p: any) => {
      const age = calcAge(p.date_of_birth);
      return age !== null && age >= 17 && ["Em Atendimento", "Fila de Espera"].includes(p.status ?? "");
    });
    const totalFaltas = appts.filter((a: any) => a.status === "Falta").length;
    const totalPresencas = appts.filter((a: any) => a.status === "Presente").length;

    const summary = {
      totalPacientes: patients.length,
      pacientesAtivos: activePatients.length,
      filaDeEspera: waiting.length,
      profissionais: professionals.length,
      faltasUltimos30Dias: totalFaltas,
      presencasUltimos30Dias: totalPresencas,
      taxaPresenca: totalFaltas + totalPresencas > 0
        ? Math.round((totalPresencas / (totalFaltas + totalPresencas)) * 100) : 0,
      pacientesProximosLimiteIdade: agingPatients.length,
    };

    const waitingBySpec = waiting.reduce((acc: Record<string, number>, w: any) => {
      const s = w.specialty ?? "Geral";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    const waitingByPriority = waiting.reduce((acc: Record<string, number>, w: any) => {
      const p = w.priority ?? "sem_prioridade";
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    }, {});

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil brasileira. Forneça um resumo executivo rápido dos indicadores.

INDICADORES DO SISTEMA:
${JSON.stringify(summary, null, 2)}

FILA DE ESPERA POR ESPECIALIDADE:
${JSON.stringify(waitingBySpec, null, 2)}

PRIORIDADES NA FILA:
${JSON.stringify(waitingByPriority, null, 2)}

Responda em formato JSON com esta estrutura exata:
{
  "saudacao": "Mensagem curta de boas-vindas e status geral (1 frase)",
  "statusGeral": "otimo|bom|atencao|critico",
  "insights": [
    {"icone": "emoji relevante", "titulo": "Título curto", "descricao": "Insight de 1-2 frases"}
  ],
  "acoesPrioritarias": [
    "Ação 1 em ordem de prioridade",
    "Ação 2",
    "Ação 3"
  ],
  "indicadores": {
    "saude": "X/10",
    "eficiencia": "X/10",
    "risco": "baixo|medio|alto"
  }
}

Seja conciso e acionável. Foque em insights que gerem ação imediata do gestor.
Responda APENAS com o JSON, sem markdown.`;

    const result = await model.generateContent(prompt);
    const parsed = parseAIResponse(result.response.text());

    res.json({ success: true, analysis: parsed, summary });
  } catch (err: any) {
    console.error("[AI] full-analysis error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
}
