import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  patientsTable,
  appointmentsTable,
  professionalsTable,
  waitingListTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, or } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

function getModel() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
}

// ── Helper: calcular idade a partir de data de nascimento ──────────────────
function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ── Helper: today string ───────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. OTIMIZAÇÃO DA FILA DE ESPERA
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ai/waiting-list-optimization", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    // Buscar fila de espera com dados do paciente
    const waitingRows = await db
      .select({
        id: waitingListTable.id,
        patientId: waitingListTable.patientId,
        patientName: patientsTable.name,
        dateOfBirth: patientsTable.dateOfBirth,
        specialty: waitingListTable.specialty,
        priority: waitingListTable.priority,
        entryDate: waitingListTable.entryDate,
        triagemScore: patientsTable.triagemScore,
        scorePsicologia: patientsTable.scorePsicologia,
        scorePsicomotricidade: patientsTable.scorePsicomotricidade,
        scoreFisioterapia: patientsTable.scoreFisioterapia,
        scoreTo: patientsTable.scoreTo,
        scoreFonoaudiologia: patientsTable.scoreFonoaudiologia,
        scoreNutricionista: patientsTable.scoreNutricionista,
        scorePsicopedagogia: patientsTable.scorePsicopedagogia,
        scoreEdFisica: patientsTable.scoreEdFisica,
        escolaPublica: patientsTable.escolaPublica,
        trabalhoNaRoca: patientsTable.trabalhoNaRoca,
        abrigoCasaCrianca: patientsTable.abrigoCasaCrianca,
      })
      .from(waitingListTable)
      .leftJoin(patientsTable, eq(waitingListTable.patientId, patientsTable.id))
      .where(eq(waitingListTable.companyId, companyId));

    // Buscar capacidade dos profissionais
    const professionals = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.companyId, companyId));

    // Contar agendamentos ativos por profissional
    const profCapacity = await Promise.all(
      professionals.map(async (p) => {
        const [countRow] = await db
          .select({ count: sql<number>`count(distinct ${appointmentsTable.patientId})` })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.professionalId, p.id),
              eq(appointmentsTable.companyId, companyId)
            )
          );
        return {
          name: p.name,
          specialty: p.specialty,
          cargaHoraria: p.cargaHoraria,
          pacientesAtivos: Number(countRow?.count ?? 0),
        };
      })
    );

    const waitingData = waitingRows.map((w) => ({
      paciente: w.patientName,
      idade: calcAge(w.dateOfBirth as string | null),
      especialidade: w.specialty,
      prioridade: w.priority,
      dataEntrada: w.entryDate,
      triagemScore: w.triagemScore,
      abrigo: w.abrigoCasaCrianca,
      escolaPublica: w.escolaPublica,
    }));

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
    const text = result.response.text();
    
    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { resumo: text, alertas: [], sugestoes: [], metricas: {} };
    }

    res.json({ success: true, analysis: parsed, rawPatientCount: waitingData.length });
  } catch (err: any) {
    console.error("[AI Brain] waiting-list-optimization error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. ALERTAS DE EVASÃO / CHURN
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ai/churn-alerts", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    // Buscar pacientes ativos com seus agendamentos
    const activePatients = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        status: patientsTable.status,
        dateOfBirth: patientsTable.dateOfBirth,
        phone: patientsTable.phone,
        entryDate: patientsTable.entryDate,
      })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.companyId, companyId),
          or(
            eq(patientsTable.status, "Em Atendimento"),
            eq(patientsTable.status, "Fila de Espera"),
            eq(patientsTable.status, "Aguardando Triagem")
          )
        )
      );

    // Buscar agendamentos dos últimos 90 dias
    const today = todayStr();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyStr = ninetyDaysAgo.toISOString().split("T")[0];

    const recentAppts = await db
      .select({
        patientId: appointmentsTable.patientId,
        date: appointmentsTable.date,
        status: appointmentsTable.status,
        professionalName: professionalsTable.name,
        specialty: professionalsTable.specialty,
      })
      .from(appointmentsTable)
      .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
      .where(
        and(
          eq(appointmentsTable.companyId, companyId),
          gte(appointmentsTable.date, ninetyStr)
        )
      );

    // Montar dados por paciente
    const patientAppts = new Map<number, typeof recentAppts>();
    for (const a of recentAppts) {
      if (!a.patientId) continue;
      const arr = patientAppts.get(a.patientId) ?? [];
      arr.push(a);
      patientAppts.set(a.patientId, arr);
    }

    const patientData = activePatients.map((p) => {
      const appts = patientAppts.get(p.id) ?? [];
      const faltas = appts.filter((a) => a.status === "Falta").length;
      const presencas = appts.filter((a) =>
        ["Presente", "Confirmado", "Em Espera"].includes(a.status ?? "")
      ).length;
      const ultimaPresenca = appts
        .filter((a) => a.status === "Presente")
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        [0]?.date ?? null;

      return {
        nome: p.name,
        status: p.status,
        idade: calcAge(p.dateOfBirth),
        dataEntrada: p.entryDate,
        totalAgendamentos: appts.length,
        faltas,
        presencas,
        taxaPresenca: appts.length > 0 ? Math.round((presencas / appts.length) * 100) : 0,
        ultimaPresenca,
        profissionais: [...new Set(appts.map((a) => `${a.specialty}: ${a.professionalName}`))],
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
    const text = result.response.text();

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { resumo: text, riscoAlto: [], riscoModerado: [], metricas: {} };
    }

    res.json({ success: true, analysis: parsed, totalPatients: patientData.length });
  } catch (err: any) {
    console.error("[AI Brain] churn-alerts error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. RELATÓRIO DE LIMITE DE IDADE
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ai/age-limit-report", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    const patients = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        dateOfBirth: patientsTable.dateOfBirth,
        status: patientsTable.status,
        entryDate: patientsTable.entryDate,
      })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.companyId, companyId),
          or(
            eq(patientsTable.status, "Em Atendimento"),
            eq(patientsTable.status, "Fila de Espera")
          )
        )
      );

    // Buscar especialidades ativas por paciente
    const appts = await db
      .select({
        patientId: appointmentsTable.patientId,
        specialty: professionalsTable.specialty,
        professionalName: professionalsTable.name,
      })
      .from(appointmentsTable)
      .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
      .where(eq(appointmentsTable.companyId, companyId));

    const patientSpecs = new Map<number, Set<string>>();
    for (const a of appts) {
      if (!a.patientId || !a.specialty) continue;
      const set = patientSpecs.get(a.patientId) ?? new Set();
      set.add(a.specialty);
      patientSpecs.set(a.patientId, set);
    }

    const patientData = patients
      .map((p) => ({
        nome: p.name,
        dataNascimento: p.dateOfBirth,
        idade: calcAge(p.dateOfBirth),
        status: p.status,
        especialidades: [...(patientSpecs.get(p.id) ?? [])],
        dataEntrada: p.entryDate,
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
    const text = result.response.text();

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { resumo: text, proximosDoLimite: [], foraDoLimite: [], faixasEtarias: {}, alertas: [] };
    }

    res.json({ success: true, analysis: parsed, totalPatients: patientData.length });
  } catch (err: any) {
    console.error("[AI Brain] age-limit-report error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. AUTO-HEALING — Detectar inconsistências no banco
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ai/system-health", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    // 1. Pacientes "Em Atendimento" sem agendamentos
    const emAtendimento = await db
      .select({ id: patientsTable.id, name: patientsTable.name })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.companyId, companyId),
          eq(patientsTable.status, "Em Atendimento")
        )
      );

    const orphanPatients: Array<{ id: number; name: string }> = [];
    for (const p of emAtendimento) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.patientId, p.id),
            eq(appointmentsTable.companyId, companyId)
          )
        );
      if (Number(countRow?.count ?? 0) === 0) {
        orphanPatients.push(p);
      }
    }

    // 2. Pacientes na fila E em atendimento ao mesmo tempo
    const filaAndAtendimento = await db
      .select({
        patientId: waitingListTable.patientId,
        patientName: patientsTable.name,
        patientStatus: patientsTable.status,
        specialty: waitingListTable.specialty,
      })
      .from(waitingListTable)
      .leftJoin(patientsTable, eq(waitingListTable.patientId, patientsTable.id))
      .where(
        and(
          eq(waitingListTable.companyId, companyId),
          eq(patientsTable.status, "Em Atendimento")
        )
      );

    // 3. Agendamentos sem paciente válido (fantasmas)
    const ghostAppts = await db
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        date: appointmentsTable.date,
        time: appointmentsTable.time,
        professionalName: professionalsTable.name,
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
      .where(
        and(
          eq(appointmentsTable.companyId, companyId),
          sql`${patientsTable.id} IS NULL`
        )
      );

    // 4. Pacientes com status inconsistente
    const statusInconsistencies: Array<{name: string; status: string; issue: string}> = [];
    
    // Pacientes com Alta/Óbito/Desistência mas ainda na fila
    const exitedInQueue = await db
      .select({
        patientName: patientsTable.name,
        patientStatus: patientsTable.status,
        specialty: waitingListTable.specialty,
      })
      .from(waitingListTable)
      .leftJoin(patientsTable, eq(waitingListTable.patientId, patientsTable.id))
      .where(
        and(
          eq(waitingListTable.companyId, companyId),
          or(
            eq(patientsTable.status, "Alta"),
            eq(patientsTable.status, "Óbito"),
            eq(patientsTable.status, "Desistência")
          )
        )
      );

    for (const r of exitedInQueue) {
      statusInconsistencies.push({
        name: r.patientName ?? "Desconhecido",
        status: r.patientStatus ?? "?",
        issue: `Paciente com status "${r.patientStatus}" ainda na fila de ${r.specialty ?? "geral"}`,
      });
    }

    // 5. Pacientes duplicados (mesmo nome, mesmo company)
    const duplicates = await db
      .select({
        name: patientsTable.name,
        count: sql<number>`count(*)`,
      })
      .from(patientsTable)
      .where(eq(patientsTable.companyId, companyId))
      .groupBy(patientsTable.name)
      .having(sql`count(*) > 1`);

    const healthData = {
      orphanPatients: orphanPatients.map((p) => ({ nome: p.name, issue: "Em Atendimento sem agendamentos" })),
      filaAndAtendimento: filaAndAtendimento.map((r) => ({
        nome: r.patientName,
        especialidadeNaFila: r.specialty,
        issue: "Na fila de espera E em atendimento simultaneamente",
      })),
      ghostAppts: ghostAppts.map((a) => ({
        id: a.id,
        data: a.date,
        hora: a.time,
        profissional: a.professionalName,
        issue: "Agendamento sem paciente válido (fantasma)",
      })),
      statusInconsistencies,
      duplicates: duplicates.map((d) => ({
        nome: d.name,
        quantidade: Number(d.count),
        issue: "Possível cadastro duplicado",
      })),
    };

    const totalIssues =
      healthData.orphanPatients.length +
      healthData.filaAndAtendimento.length +
      healthData.ghostAppts.length +
      healthData.statusInconsistencies.length +
      healthData.duplicates.length;

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
    const text = result.response.text();

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { resumo: text, saude: "desconhecido", problemas: [], metricas: {}, recomendacoes: [] };
    }

    res.json({ success: true, analysis: parsed, rawIssues: totalIssues });
  } catch (err: any) {
    console.error("[AI Brain] system-health error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. ANÁLISE COMPLETA (combina todos os módulos)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ai/full-analysis", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "x-company-id required" });

    // Buscar dados essenciais
    const [patients, waiting, professionals] = await Promise.all([
      db.select().from(patientsTable).where(eq(patientsTable.companyId, companyId)),
      db
        .select({
          id: waitingListTable.id,
          patientId: waitingListTable.patientId,
          specialty: waitingListTable.specialty,
          priority: waitingListTable.priority,
          entryDate: waitingListTable.entryDate,
        })
        .from(waitingListTable)
        .where(eq(waitingListTable.companyId, companyId)),
      db.select().from(professionalsTable).where(eq(professionalsTable.companyId, companyId)),
    ]);

    const today = todayStr();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split("T")[0];

    const recentAppts = await db
      .select({
        patientId: appointmentsTable.patientId,
        status: appointmentsTable.status,
        date: appointmentsTable.date,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.companyId, companyId),
          gte(appointmentsTable.date, thirtyStr)
        )
      );

    // Montar resumo rápido sem IA (dados brutos)
    const activePatients = patients.filter((p) =>
      ["Em Atendimento", "Fila de Espera"].includes(p.status ?? "")
    );
    const agingPatients = patients.filter((p) => {
      const age = calcAge(p.dateOfBirth);
      return age !== null && age >= 17 && ["Em Atendimento", "Fila de Espera"].includes(p.status ?? "");
    });
    const totalFaltas = recentAppts.filter((a) => a.status === "Falta").length;
    const totalPresencas = recentAppts.filter((a) => a.status === "Presente").length;

    const summary = {
      totalPacientes: patients.length,
      pacientesAtivos: activePatients.length,
      filaDeEspera: waiting.length,
      profissionais: professionals.length,
      faltasUltimos30Dias: totalFaltas,
      presencasUltimos30Dias: totalPresencas,
      taxaPresenca: totalFaltas + totalPresencas > 0
        ? Math.round((totalPresencas / (totalFaltas + totalPresencas)) * 100)
        : 0,
      pacientesProximosLimiteIdade: agingPatients.length,
    };

    const model = getModel();
    const prompt = `Você é o cérebro de IA de uma clínica multidisciplinar infantil brasileira. Forneça um resumo executivo rápido dos indicadores.

INDICADORES DO SISTEMA:
${JSON.stringify(summary, null, 2)}

FILA DE ESPERA POR ESPECIALIDADE:
${JSON.stringify(
  waiting.reduce((acc: Record<string, number>, w) => {
    const s = w.specialty ?? "Geral";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {}),
  null,
  2
)}

PRIORIDADES NA FILA:
${JSON.stringify(
  waiting.reduce((acc: Record<string, number>, w) => {
    const p = w.priority ?? "sem_prioridade";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {}),
  null,
  2
)}

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
    const text = result.response.text();

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { saudacao: text, statusGeral: "desconhecido", insights: [], acoesPrioritarias: [], indicadores: {} };
    }

    res.json({ success: true, analysis: parsed, summary });
  } catch (err: any) {
    console.error("[AI Brain] full-analysis error:", err);
    res.status(500).json({ error: err.message ?? "Erro interno" });
  }
});

export default router;
