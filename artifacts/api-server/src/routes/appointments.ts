import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appointmentsTable, patientsTable, professionalsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/appointments/today", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const conditions: ReturnType<typeof eq>[] = [eq(appointmentsTable.date, today)];
  if (req.query.professionalId) {
    conditions.push(eq(appointmentsTable.professionalId, Number(req.query.professionalId)));
  }

  const rows = await db.select({
    id: appointmentsTable.id,
    patientId: appointmentsTable.patientId,
    professionalId: appointmentsTable.professionalId,
    date: appointmentsTable.date,
    time: appointmentsTable.time,
    status: appointmentsTable.status,
    notes: appointmentsTable.notes,
    rescheduledTo: appointmentsTable.rescheduledTo,
    patientName: patientsTable.name,
    patientPhone: patientsTable.phone,
    patientAbsenceCount: patientsTable.absenceCount,
    professionalName: professionalsTable.name,
    professionalSpecialty: professionalsTable.specialty,
    createdAt: appointmentsTable.createdAt,
    updatedAt: appointmentsTable.updatedAt,
  })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
    .where(and(...conditions))
    .orderBy(appointmentsTable.time);

  res.json(rows.map(r => ({
    ...r,
    patientName: r.patientName ?? "",
    patientPhone: r.patientPhone ?? null,
    patientAbsenceCount: r.patientAbsenceCount ?? 0,
    professionalName: r.professionalName ?? "",
    professionalSpecialty: r.professionalSpecialty ?? "",
  })));
});

router.get("/appointments/stats", async (_req, res) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
  const monthStart = new Date(y, m, 1);
  const trimStart = new Date(y, m - 2, 1);
  const semStart = new Date(y, m - 5, 1);
  const yearStart = new Date(y, 0, 1);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const rows = await db.select({ date: appointmentsTable.date }).from(appointmentsTable);

  const count = (from: Date) => rows.filter(r => r.date >= fmt(from)).length;

  res.json({
    semanal: count(weekStart),
    mensal: count(monthStart),
    trimestral: count(trimStart),
    semestral: count(semStart),
    anual: count(yearStart),
  });
});

router.get("/appointments", async (req, res) => {
  const conditions: ReturnType<typeof eq>[] = [];
  if (req.query.date) conditions.push(eq(appointmentsTable.date, String(req.query.date)));
  if (req.query.professionalId) conditions.push(eq(appointmentsTable.professionalId, Number(req.query.professionalId)));
  if (req.query.patientId) conditions.push(eq(appointmentsTable.patientId, Number(req.query.patientId)));

  const rows = conditions.length
    ? await db.select().from(appointmentsTable).where(and(...conditions))
    : await db.select().from(appointmentsTable);
  res.json(rows);
});

router.post("/appointments", async (req, res) => {
  const { patientId, professionalId, date, time, notes, fromWaitingList } = req.body;
  const [row] = await db.insert(appointmentsTable).values({
    patientId: Number(patientId),
    professionalId: Number(professionalId),
    date,
    time,
    status: "agendado",
    notes: notes ?? null,
  }).returning();

  if (fromWaitingList) {
    await db.update(patientsTable)
      .set({ status: "Atendimento", professionalId: Number(professionalId) })
      .where(eq(patientsTable.id, Number(patientId)));

    const { waitingListTable } = await import("@workspace/db");
    await db.delete(waitingListTable).where(eq(waitingListTable.patientId, Number(patientId)));
  }

  res.status(201).json(row);
});

router.get("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!row) return res.status(404).json({ error: "Appointment not found" });
  res.json(row);
});

router.patch("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status, rescheduledTo, notes } = req.body;

  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Appointment not found" });

  const [row] = await db.update(appointmentsTable)
    .set({ status, rescheduledTo: rescheduledTo ?? null, notes: notes ?? existing.notes })
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (status === "ausente" && existing.status !== "ausente") {
    const [patient] = await db.select({ absenceCount: patientsTable.absenceCount })
      .from(patientsTable).where(eq(patientsTable.id, existing.patientId));
    const newCount = (patient?.absenceCount ?? 0) + 1;
    await db.update(patientsTable)
      .set({ absenceCount: newCount })
      .where(eq(patientsTable.id, existing.patientId));
  } else if (existing.status === "ausente" && status !== "ausente") {
    const [patient] = await db.select({ absenceCount: patientsTable.absenceCount })
      .from(patientsTable).where(eq(patientsTable.id, existing.patientId));
    const newCount = Math.max(0, (patient?.absenceCount ?? 1) - 1);
    await db.update(patientsTable)
      .set({ absenceCount: newCount })
      .where(eq(patientsTable.id, existing.patientId));
  }

  res.json(row);
});

router.delete("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.status(204).send();
});

export default router;
