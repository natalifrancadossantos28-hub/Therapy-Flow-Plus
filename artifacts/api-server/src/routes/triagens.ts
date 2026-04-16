import { Router } from "express";
import { db, triagens } from "@workspace/db";
import { patientsTable, waitingListTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import fs from "fs";

const router = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

const extractFields = (body: any) => ({
  nome: body.nome,
  dataNascimento: body.dataNascimento,
  idade: body.idade,
  responsavel: body.responsavel,
  telefone: body.telefone,
  endereco: body.endereco,
  naturalidade: body.naturalidade,
  rg: body.rg,
  cpf: body.cpf,
  sus: body.sus,
  nomeMae: body.nomeMae,
  escolaridadeMae: body.escolaridadeMae,
  profissaoMae: body.profissaoMae,
  nomePai: body.nomePai,
  escolaridadePai: body.escolaridadePai,
  profissaoPai: body.profissaoPai,
  numIrmaos: body.numIrmaos,
  tipoImovel: body.tipoImovel,
  bolsaFamilia: !!body.bolsaFamilia,
  bpc: !!body.bpc,
  pensao: !!body.pensao,
  auxilioDoenca: !!body.auxilioDoenca,
  outrosAuxilios: body.outrosAuxilios,
  rendaFamiliar: body.rendaFamiliar,
  diagnostico: body.diagnostico,
  cid: body.cid,
  cid11: body.cid11,
  medico: body.medico,
  dataUltimaCons: body.dataUltimaCons,
  cadeiraDeRodas: !!body.cadeiraDeRodas,
  ortesesProteses: !!body.ortesesProteses,
  aparelhoAuditivo: !!body.aparelhoAuditivo,
  medicacaoContinua: body.medicacaoContinua,
  alergias: body.alergias,
  problemasSaude: body.problemasSaude,
  tipoEscola: body.tipoEscola,
  trabalhoPais: body.trabalhoPais,
  outroAtendimento: body.outroAtendimento !== undefined ? !!body.outroAtendimento : null,
  localAtendimento: body.localAtendimento || null,
  tipoRegistro: body.tipoRegistro || "Paciente da Unidade",
  profissional: body.profissional,
  especialidade: body.especialidade,
  data: body.data,
  resultado: body.resultado,
  respostas: body.respostas ? JSON.stringify(body.respostas) : null,
});

function calcPriority(triagemScore: number, escolaPublica: boolean, trabalhoNaRoca: boolean, semTerapia: boolean = false): "elevado" | "moderado" | "leve" | "baixo" {
  const levels: Array<"elevado" | "moderado" | "leve" | "baixo"> = ["baixo", "leve", "moderado", "elevado"];
  const baseIdx = triagemScore >= 270 ? 3 : triagemScore >= 180 ? 2 : triagemScore >= 90 ? 1 : 0;
  const vuln = (escolaPublica ? 1 : 0) + (trabalhoNaRoca ? 1 : 0) + (semTerapia ? 1 : 0);
  const idx = Math.min(3, baseIdx + vuln);
  return levels[idx];
}

const PRIORITY_LABELS: Record<string, string> = {
  elevado: "Elevado 🔴",
  moderado: "Moderado 🟠",
  leve: "Leve 🔵",
  baixo: "Baixo 🟢",
};

function writeCarlaNotification(patientName: string, priority: string) {
  const label = PRIORITY_LABELS[priority] ?? priority;
  const entry = {
    mensagem: `🏥 Nati, triagem concluída! O(a) ${patientName} já está na fila de espera com prioridade ${label}.`,
    tipo: "triagem",
    timestamp: new Date().toISOString(),
  };
  try {
    let log: any[] = [];
    if (fs.existsSync("/tmp/bot_activity.json")) {
      log = JSON.parse(fs.readFileSync("/tmp/bot_activity.json", "utf-8"));
    }
    log.unshift(entry);
    if (log.length > 50) log = log.slice(0, 50);
    fs.writeFileSync("/tmp/bot_activity.json", JSON.stringify(log));
  } catch (e) {
    console.error("Erro ao escrever notificação Carla:", e);
  }
}

async function autoLinkTriagem(row: any, companyId: number | null) {
  const respostas: number[] = row.respostas ? JSON.parse(row.respostas) : null;
  if (!Array.isArray(respostas) || respostas.length < 120) return null;

  const triagemScore = respostas.reduce((a: number, b: number) => a + b, 0);

  const AREA_FIELDS = [
    { field: "scorePsicologia",        start: 0   },
    { field: "scorePsicomotricidade",  start: 15  },
    { field: "scoreFisioterapia",      start: 30  },
    { field: "scoreTO",                start: 45  },
    { field: "scoreFonoaudiologia",    start: 60  },
    { field: "scoreNutricionista",     start: 75  },
    { field: "scorePsicopedagogia",    start: 90  },
    { field: "scoreEdFisica",          start: 105 },
  ];

  const areaScores: Record<string, number> = {};
  for (const { field, start } of AREA_FIELDS) {
    areaScores[field] = respostas.slice(start, start + 15).reduce((a: number, b: number) => a + b, 0);
  }

  const escolaPublica = ["Municipal", "Estadual"].includes(row.tipoEscola ?? "");
  const trabalhoNaRoca = ["Informal/Roça", "Desempregado"].includes(row.trabalhoPais ?? "");

  let patient: any = null;

  const cpfClean = row.cpf?.replace(/\D/g, "");
  if (cpfClean && cpfClean.length >= 11) {
    const conditions: any[] = [sql`REGEXP_REPLACE(cpf, '[^0-9]', '', 'g') = ${cpfClean}`];
    if (companyId) conditions.push(eq(patientsTable.companyId, companyId));
    const [p] = await db.select().from(patientsTable).where(and(...conditions));
    patient = p;
  }

  if (!patient && row.nome) {
    const conditions: any[] = [sql`LOWER(TRIM(name)) = LOWER(TRIM(${row.nome}))`];
    if (companyId) conditions.push(eq(patientsTable.companyId, companyId));
    const [p] = await db.select().from(patientsTable).where(and(...conditions));
    patient = p;
  }

  if (!patient) return null;

  // Propagate tipoRegistro from triagem record to patient (if not already set)
  const triagemTipo = row.tipoRegistro ?? null;
  const patientTipo = patient.tipoRegistro ?? null;
  const updateFields: Record<string, unknown> = {
    triagemScore,
    ...areaScores,
    escolaPublica,
    trabalhoNaRoca,
  };
  if (triagemTipo && !patientTipo) {
    updateFields.tipoRegistro = triagemTipo;
  }
  if (row.localAtendimento && !patient.localAtendimento) {
    updateFields.localAtendimento = row.localAtendimento;
  }

  await db.update(patientsTable).set(updateFields).where(eq(patientsTable.id, patient.id));

  // Censo Municipal patients must never enter the waiting list
  const resolvedTipo = triagemTipo || patientTipo;
  if (resolvedTipo === "Registro Censo Municipal") {
    return { patientName: patient.name, linkedOnly: true, scoresUpdated: true, censoMunicipal: true };
  }

  const SKIP_STATUSES = new Set(["Alta", "Óbito", "Desistência", "Atendimento", "Fila de Espera"]);
  if (SKIP_STATUSES.has(patient.status)) {
    return { patientName: patient.name, linkedOnly: true, scoresUpdated: true };
  }

  const existing = await db.select({ id: waitingListTable.id })
    .from(waitingListTable)
    .where(eq(waitingListTable.patientId, patient.id));

  if (existing.length > 0) {
    return { patientName: patient.name, linkedOnly: true, scoresUpdated: true };
  }

  const semTerapia = (row.localAtendimento === "Sem Atendimento" || row.localAtendimento === "Nenhum");
  const priority = calcPriority(triagemScore, escolaPublica, trabalhoNaRoca, semTerapia);
  const today = new Date().toISOString().split("T")[0];
  const specialty = row.especialidade ?? null;

  await db.insert(waitingListTable).values({
    patientId: patient.id,
    professionalId: null,
    specialty,
    priority,
    notes: null,
    entryDate: today,
    ...(companyId ? { companyId } : {}),
  });

  await db.update(patientsTable)
    .set({ status: "Fila de Espera" })
    .where(eq(patientsTable.id, patient.id));

  writeCarlaNotification(patient.name, priority);

  return { patientName: patient.name, priority, addedToQueue: true, scoresUpdated: true };
}

router.get("/triagens", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const rows = companyId
      ? await db.select().from(triagens).where(eq(triagens.companyId, companyId)).orderBy(desc(triagens.createdAt))
      : await db.select().from(triagens).orderBy(desc(triagens.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar triagens" });
  }
});

router.get("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    const [row] = await db.select().from(triagens).where(and(...conditions));
    if (!row) return res.status(404).json({ error: "Triagem não encontrada" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar triagem" });
  }
});

router.post("/triagens", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const [row] = await db.insert(triagens).values({
      ...extractFields(req.body),
      ...(companyId ? { companyId } : {}),
    }).returning();

    const autoResult = await autoLinkTriagem(row, companyId).catch(e => {
      console.error("Erro na vinculação automática da triagem:", e);
      return null;
    });

    res.status(201).json({ ...row, _autoLink: autoResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar triagem" });
  }
});

router.put("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    const [row] = await db
      .update(triagens)
      .set(extractFields(req.body))
      .where(and(...conditions))
      .returning();
    if (!row) return res.status(404).json({ error: "Triagem não encontrada" });

    await autoLinkTriagem(row, companyId).catch(e => {
      console.error("Erro na vinculação automática da triagem (PUT):", e);
    });

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar triagem" });
  }
});

router.delete("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    await db.delete(triagens).where(and(...conditions));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir triagem" });
  }
});

export default router;
