import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { waitingListTable, patientsTable, professionalsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

const priorityOrder = sql`CASE priority WHEN 'elevado' THEN 1 WHEN 'alta' THEN 1 WHEN 'moderado' THEN 2 WHEN 'media' THEN 2 WHEN 'leve' THEN 3 WHEN 'baixo' THEN 4 WHEN 'baixa' THEN 4 ELSE 5 END`;

router.get("/waiting-list", async (req, res) => {
  const companyId = getCompanyId(req);
  const conditions = [];
  if (companyId) conditions.push(eq(waitingListTable.companyId, companyId));
  if (req.query.professionalId) {
    conditions.push(eq(waitingListTable.professionalId, Number(req.query.professionalId)));
  }

  const rows = await db.select({
    id: waitingListTable.id,
    patientId: waitingListTable.patientId,
    patientName: patientsTable.name,
    patientPhone: patientsTable.phone,
    patientProntuario: patientsTable.prontuario,
    professionalId: waitingListTable.professionalId,
    professionalName: professionalsTable.name,
    professionalSpecialty: professionalsTable.specialty,
    priority: waitingListTable.priority,
    notes: waitingListTable.notes,
    entryDate: waitingListTable.entryDate,
    createdAt: waitingListTable.createdAt,
    updatedAt: waitingListTable.updatedAt,
  })
    .from(waitingListTable)
    .leftJoin(patientsTable, eq(waitingListTable.patientId, patientsTable.id))
    .leftJoin(professionalsTable, eq(waitingListTable.professionalId, professionalsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(priorityOrder, asc(waitingListTable.entryDate));

  res.json(rows.map(r => ({
    ...r,
    patientName: r.patientName ?? "",
    patientPhone: r.patientPhone ?? null,
    patientProntuario: r.patientProntuario ?? null,
    professionalName: r.professionalName ?? null,
    professionalSpecialty: r.professionalSpecialty ?? null,
  })));
});

router.post("/waiting-list", async (req, res) => {
  const companyId = getCompanyId(req);
  const { patientId, professionalId, priority, notes, entryDate } = req.body;

  const [patient] = await db.select({ triagemScore: patientsTable.triagemScore })
    .from(patientsTable)
    .where(eq(patientsTable.id, Number(patientId)));

  if (!patient) return res.status(404).json({ error: "Paciente não encontrado" });
  if (patient.triagemScore === null || patient.triagemScore === undefined) {
    return res.status(422).json({
      error: "Triagem não realizada",
      message: "O paciente precisa ter a triagem registrada antes de entrar na fila. Acesse o prontuário para registrar a triagem.",
    });
  }

  const [row] = await db.insert(waitingListTable).values({
    patientId: Number(patientId),
    professionalId: professionalId ? Number(professionalId) : null,
    priority: priority ?? "media",
    notes: notes ?? null,
    entryDate,
    ...(companyId ? { companyId } : {}),
  }).returning();

  const patientInfo = await db.select({ name: patientsTable.name, phone: patientsTable.phone })
    .from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const prof = row.professionalId
    ? await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, row.professionalId))
    : [];

  res.status(201).json({
    ...row,
    patientName: patientInfo[0]?.name ?? "",
    patientPhone: patientInfo[0]?.phone ?? null,
    professionalName: prof[0]?.name ?? null,
  });
});

router.put("/waiting-list/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { professionalId, priority, notes } = req.body;
  const updateData: Record<string, unknown> = {};
  if (priority !== undefined) updateData.priority = priority;
  if (notes !== undefined) updateData.notes = notes;
  if (professionalId !== undefined) updateData.professionalId = professionalId;

  const [row] = await db.update(waitingListTable).set(updateData).where(eq(waitingListTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Entry not found" });

  const patient = await db.select({ name: patientsTable.name, phone: patientsTable.phone })
    .from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const prof = row.professionalId
    ? await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, row.professionalId))
    : [];

  res.json({
    ...row,
    patientName: patient[0]?.name ?? "",
    patientPhone: patient[0]?.phone ?? null,
    professionalName: prof[0]?.name ?? null,
  });
});

router.delete("/waiting-list/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(waitingListTable).where(eq(waitingListTable.id, id));
  res.status(204).send();
});

export default router;
