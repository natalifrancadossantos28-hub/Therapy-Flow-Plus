import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { patientsTable, appointmentsTable, professionalsTable, waitingListTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

function calcPriority(triagemScore: number, escolaPublica: boolean, trabalhoNaRoca: boolean): "elevado" | "moderado" | "leve" | "baixo" {
  const levels: Array<"elevado" | "moderado" | "leve" | "baixo"> = ["baixo", "leve", "moderado", "elevado"];
  const baseIdx = triagemScore >= 432 ? 3 : triagemScore >= 288 ? 2 : triagemScore >= 144 ? 1 : 0;
  const vuln = (escolaPublica ? 1 : 0) + (trabalhoNaRoca ? 1 : 0);
  const idx = Math.min(3, baseIdx + vuln);
  return levels[idx];
}

router.get("/patients", async (req, res) => {
  const companyId = getCompanyId(req);
  const conditions = [];
  if (companyId) conditions.push(eq(patientsTable.companyId, companyId));
  if (req.query.professionalId) conditions.push(eq(patientsTable.professionalId, Number(req.query.professionalId)));
  if (req.query.status) conditions.push(eq(patientsTable.status, String(req.query.status)));

  const rows = conditions.length
    ? await db.select().from(patientsTable).where(and(...conditions))
    : await db.select().from(patientsTable);
  res.json(rows);
});

router.post("/patients", async (req, res) => {
  const companyId = getCompanyId(req);
  const body = req.body;
  const today = new Date().toISOString().split("T")[0];
  const entryDate = body.entryDate ?? today;
  const status = body.status ?? "Aguardando Triagem";

  const [row] = await db.insert(patientsTable).values({
    ...(companyId ? { companyId } : {}),
    prontuario: body.prontuario ?? null,
    name: body.name,
    dateOfBirth: body.dateOfBirth ?? null,
    cpf: body.cpf ?? null,
    cns: body.cns ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    motherName: body.motherName ?? null,
    guardianName: body.guardianName ?? null,
    guardianPhone: body.guardianPhone ?? null,
    diagnosis: body.diagnosis ?? null,
    notes: body.notes ?? null,
    professionalId: body.professionalId ?? null,
    status,
    entryDate,
    absenceCount: 0,
    triagemScore: body.triagemScore !== undefined ? Number(body.triagemScore) : null,
    scorePsicologia: body.scorePsicologia !== undefined ? Number(body.scorePsicologia) : null,
    scorePsicomotricidade: body.scorePsicomotricidade !== undefined ? Number(body.scorePsicomotricidade) : null,
    scoreFisioterapia: body.scoreFisioterapia !== undefined ? Number(body.scoreFisioterapia) : null,
    scorePsicopedagogia: body.scorePsicopedagogia !== undefined ? Number(body.scorePsicopedagogia) : null,
    scoreEdFisica: body.scoreEdFisica !== undefined ? Number(body.scoreEdFisica) : null,
    scoreFonoaudiologia: body.scoreFonoaudiologia !== undefined ? Number(body.scoreFonoaudiologia) : null,
    scoreTO: body.scoreTO !== undefined ? Number(body.scoreTO) : null,
    scoreNutricionista: body.scoreNutricionista !== undefined ? Number(body.scoreNutricionista) : null,
    escolaPublica: body.escolaPublica !== undefined ? Boolean(body.escolaPublica) : null,
    trabalhoNaRoca: body.trabalhoNaRoca !== undefined ? Boolean(body.trabalhoNaRoca) : null,
  }).returning();

  res.status(201).json(row);
});

router.get("/patients/next-prontuario", async (req, res) => {
  const companyId = getCompanyId(req);
  const conditions = [];
  if (companyId) conditions.push(eq(patientsTable.companyId, companyId));
  const rows = conditions.length
    ? await db.select({ prontuario: patientsTable.prontuario }).from(patientsTable).where(and(...conditions))
    : await db.select({ prontuario: patientsTable.prontuario }).from(patientsTable);
  let max = 399;
  for (const r of rows) {
    const n = parseInt((r.prontuario || "").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= 400 && n > max) max = n;
  }
  const ultimo = max > 399 ? String(max) : null;
  res.json({ nextProntuario: String(max + 1), ultimo });
});

router.get("/patients/check-prontuario/:prontuario", async (req, res) => {
  const companyId = getCompanyId(req);
  const prontuario = req.params.prontuario;
  const conditions = [eq(patientsTable.prontuario, prontuario)];
  if (companyId) conditions.push(eq(patientsTable.companyId, companyId));
  const rows = await db.select({ id: patientsTable.id, name: patientsTable.name })
    .from(patientsTable).where(and(...conditions)).limit(1);
  if (rows.length > 0) {
    res.json({ existe: true, paciente: rows[0] });
  } else {
    res.json({ existe: false });
  }
});

router.get("/patients/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!row) return res.status(404).json({ error: "Patient not found" });
  res.json(row);
});

router.put("/patients/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body;
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.prontuario !== undefined) updateData.prontuario = body.prontuario;
  if (body.dateOfBirth !== undefined) updateData.dateOfBirth = body.dateOfBirth;
  if (body.cpf !== undefined) updateData.cpf = body.cpf;
  if (body.cns !== undefined) updateData.cns = body.cns;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.motherName !== undefined) updateData.motherName = body.motherName;
  if (body.guardianName !== undefined) updateData.guardianName = body.guardianName;
  if (body.guardianPhone !== undefined) updateData.guardianPhone = body.guardianPhone;
  if (body.diagnosis !== undefined) updateData.diagnosis = body.diagnosis;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.professionalId !== undefined) updateData.professionalId = body.professionalId;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.entryDate !== undefined) updateData.entryDate = body.entryDate;
  if (body.triagemScore !== undefined) updateData.triagemScore = body.triagemScore !== null ? Number(body.triagemScore) : null;
  if (body.scorePsicologia !== undefined) updateData.scorePsicologia = body.scorePsicologia !== null ? Number(body.scorePsicologia) : null;
  if (body.scorePsicomotricidade !== undefined) updateData.scorePsicomotricidade = body.scorePsicomotricidade !== null ? Number(body.scorePsicomotricidade) : null;
  if (body.scoreFisioterapia !== undefined) updateData.scoreFisioterapia = body.scoreFisioterapia !== null ? Number(body.scoreFisioterapia) : null;
  if (body.scorePsicopedagogia !== undefined) updateData.scorePsicopedagogia = body.scorePsicopedagogia !== null ? Number(body.scorePsicopedagogia) : null;
  if (body.scoreEdFisica !== undefined) updateData.scoreEdFisica = body.scoreEdFisica !== null ? Number(body.scoreEdFisica) : null;
  if (body.scoreFonoaudiologia !== undefined) updateData.scoreFonoaudiologia = body.scoreFonoaudiologia !== null ? Number(body.scoreFonoaudiologia) : null;
  if (body.scoreTO !== undefined) updateData.scoreTO = body.scoreTO !== null ? Number(body.scoreTO) : null;
  if (body.scoreNutricionista !== undefined) updateData.scoreNutricionista = body.scoreNutricionista !== null ? Number(body.scoreNutricionista) : null;
  if (body.escolaPublica !== undefined) updateData.escolaPublica = body.escolaPublica !== null ? Boolean(body.escolaPublica) : null;
  if (body.trabalhoNaRoca !== undefined) updateData.trabalhoNaRoca = body.trabalhoNaRoca !== null ? Boolean(body.trabalhoNaRoca) : null;

  const [row] = await db.update(patientsTable).set(updateData).where(eq(patientsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Patient not found" });
  res.json(row);
});

router.delete("/patients/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(patientsTable).where(eq(patientsTable.id, id));
  res.status(204).send();
});

router.post("/patients/:id/add-to-fila", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  if (patient.triagemScore === null || patient.triagemScore === undefined) {
    return res.status(422).json({
      error: "Triagem não realizada",
      message: "O paciente precisa ter a triagem registrada antes de entrar na fila.",
    });
  }

  const existing = await db.select({ id: waitingListTable.id })
    .from(waitingListTable)
    .where(eq(waitingListTable.patientId, id));
  if (existing.length > 0) {
    return res.status(409).json({
      error: "Já na fila",
      message: "Este paciente já está na fila de espera.",
    });
  }

  const priority = calcPriority(
    patient.triagemScore,
    patient.escolaPublica ?? false,
    patient.trabalhoNaRoca ?? false,
  );

  const today = new Date().toISOString().split("T")[0];
  const specialty = req.body.specialty ?? null;

  const [entry] = await db.insert(waitingListTable).values({
    patientId: id,
    professionalId: null,
    specialty,
    priority,
    notes: req.body.notes ?? null,
    entryDate: today,
    ...(companyId ? { companyId } : {}),
  }).returning();

  await db.update(patientsTable)
    .set({ status: "Fila de Espera" })
    .where(eq(patientsTable.id, id));

  res.status(201).json({
    ...entry,
    priority,
    patientName: patient.name,
    calculatedFrom: {
      triagemScore: patient.triagemScore,
      escolaPublica: patient.escolaPublica,
      trabalhoNaRoca: patient.trabalhoNaRoca,
    },
  });
});

router.get("/patients/:id/absences", async (req, res) => {
  const id = Number(req.params.id);
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const absences = await db.select({
    appointmentId: appointmentsTable.id,
    date: appointmentsTable.date,
    time: appointmentsTable.time,
  })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.patientId, id), eq(appointmentsTable.status, "ausente")));

  res.json({
    patientId: id,
    patientName: patient.name,
    absenceCount: patient.absenceCount,
    hasWarning: patient.absenceCount >= 3,
    absences,
  });
});

router.get("/patients/:id/pdf", async (req, res) => {
  const id = Number(req.params.id);
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  let professional = null;
  if (patient.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, patient.professionalId));
    professional = prof ?? null;
  }

  const totalResult = await db.select({ count: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, id));
  const totalAppointments = totalResult[0]?.count ?? 0;

  const lastAppt = await db.select({ date: appointmentsTable.date })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, id))
    .orderBy(sql`date desc`)
    .limit(1);

  res.json({
    patient,
    professional,
    absenceCount: patient.absenceCount,
    totalAppointments,
    lastAppointmentDate: lastAppt[0]?.date ?? null,
  });
});

export default router;
