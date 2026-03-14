import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { patientsTable, appointmentsTable, professionalsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/patients", async (req, res) => {
  let query = db.select({
    id: patientsTable.id,
    name: patientsTable.name,
    dateOfBirth: patientsTable.dateOfBirth,
    cpf: patientsTable.cpf,
    phone: patientsTable.phone,
    email: patientsTable.email,
    address: patientsTable.address,
    guardianName: patientsTable.guardianName,
    guardianPhone: patientsTable.guardianPhone,
    diagnosis: patientsTable.diagnosis,
    notes: patientsTable.notes,
    professionalId: patientsTable.professionalId,
    status: patientsTable.status,
    absenceCount: patientsTable.absenceCount,
    createdAt: patientsTable.createdAt,
    updatedAt: patientsTable.updatedAt,
  }).from(patientsTable);

  const conditions = [];
  if (req.query.professionalId) {
    conditions.push(eq(patientsTable.professionalId, Number(req.query.professionalId)));
  }
  if (req.query.status) {
    conditions.push(eq(patientsTable.status, String(req.query.status)));
  }

  const rows = conditions.length
    ? await query.where(and(...conditions))
    : await query;
  res.json(rows);
});

router.post("/patients", async (req, res) => {
  const body = req.body;
  const [row] = await db.insert(patientsTable).values({
    name: body.name,
    dateOfBirth: body.dateOfBirth ?? null,
    cpf: body.cpf ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    guardianName: body.guardianName ?? null,
    guardianPhone: body.guardianPhone ?? null,
    diagnosis: body.diagnosis ?? null,
    notes: body.notes ?? null,
    professionalId: body.professionalId ?? null,
    status: body.status ?? "ativo",
    absenceCount: 0,
  }).returning();
  res.status(201).json(row);
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
  if (body.dateOfBirth !== undefined) updateData.dateOfBirth = body.dateOfBirth;
  if (body.cpf !== undefined) updateData.cpf = body.cpf;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.guardianName !== undefined) updateData.guardianName = body.guardianName;
  if (body.guardianPhone !== undefined) updateData.guardianPhone = body.guardianPhone;
  if (body.diagnosis !== undefined) updateData.diagnosis = body.diagnosis;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.professionalId !== undefined) updateData.professionalId = body.professionalId;
  if (body.status !== undefined) updateData.status = body.status;

  const [row] = await db.update(patientsTable).set(updateData).where(eq(patientsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Patient not found" });
  res.json(row);
});

router.delete("/patients/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(patientsTable).where(eq(patientsTable.id, id));
  res.status(204).send();
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
