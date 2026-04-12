import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { professionalsTable, patientsTable, waitingListTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

const getMaxCapacity = (cargaHoraria: string) => cargaHoraria === "20h" ? 20 : 30;

router.get("/professionals", async (_req, res) => {
  const rows = await db.select().from(professionalsTable);
  res.json(rows);
});

router.post("/professionals", async (req, res) => {
  const { name, specialty, email, phone, pin, cargaHoraria } = req.body;
  const [row] = await db.insert(professionalsTable).values({
    name, specialty, email, phone,
    pin: pin ?? null,
    cargaHoraria: cargaHoraria ?? "30h",
  }).returning();
  res.status(201).json(row);
});

router.post("/professionals/:id/verify-pin", async (req, res) => {
  const id = Number(req.params.id);
  const { pin } = req.body;
  const [prof] = await db.select({ id: professionalsTable.id, pin: professionalsTable.pin }).from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!prof) return res.status(404).json({ error: "Profissional não encontrado" });
  if (!prof.pin) return res.status(400).json({ error: "PIN não configurado para este profissional" });
  if (prof.pin !== String(pin)) return res.status(401).json({ error: "PIN incorreto" });
  res.json({ ok: true });
});

router.get("/professionals/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) return res.status(404).json({ error: "Professional not found" });
  res.json(row);
});

router.put("/professionals/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, specialty, email, phone, pin, cargaHoraria } = req.body;
  const updateData: Record<string, unknown> = { name, specialty, email, phone };
  if (pin !== undefined) updateData.pin = pin || null;
  if (cargaHoraria !== undefined) updateData.cargaHoraria = cargaHoraria;
  const [row] = await db.update(professionalsTable).set(updateData).where(eq(professionalsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Professional not found" });
  res.json(row);
});

router.delete("/professionals/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(professionalsTable).where(eq(professionalsTable.id, id));
  res.status(204).send();
});

router.get("/professionals/:id/capacity", async (req, res) => {
  const id = Number(req.params.id);
  const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!prof) return res.status(404).json({ error: "Professional not found" });

  const activePatients = await db.select({ count: sql<number>`count(*)::int` })
    .from(patientsTable)
    .where(and(eq(patientsTable.professionalId, id), eq(patientsTable.status, "ativo")));
  const count = activePatients[0]?.count ?? 0;
  const maxCapacity = getMaxCapacity(prof.cargaHoraria ?? "30h");

  res.json({
    professionalId: id,
    professionalName: prof.name,
    cargaHoraria: prof.cargaHoraria ?? "30h",
    activePatients: count,
    maxCapacity,
    availableSlots: Math.max(0, maxCapacity - count),
  });
});

const SCHEDULE_SLOTS = [
  "08:00", "08:50", "09:40", "10:30", "11:20",
  "13:10", "14:00", "14:50", "15:40",
];
const LUNCH_SLOT = "12:10";
// Encerra às 16:30 (último atendimento 15:40 + 50 min)

router.get("/professionals/:id/schedule", async (req, res) => {
  const id = Number(req.params.id);
  const date = String(req.query.date ?? "");

  const { appointmentsTable } = await import("@workspace/db");
  const appointments = await db.select({
    id: appointmentsTable.id,
    patientId: appointmentsTable.patientId,
    time: appointmentsTable.time,
    status: appointmentsTable.status,
    patientName: patientsTable.name,
  })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .where(and(eq(appointmentsTable.professionalId, id), eq(appointmentsTable.date, date)));

  const apptMap: Record<string, typeof appointments[0]> = {};
  for (const a of appointments) {
    apptMap[a.time] = a;
  }

  const allSlots = [...SCHEDULE_SLOTS];
  allSlots.splice(5, 0, LUNCH_SLOT);

  const slots = allSlots.map((time) => {
    if (time === LUNCH_SLOT) {
      return { time, appointmentId: null, patientId: null, patientName: null, status: null, isLunchBreak: true };
    }
    const appt = apptMap[time];
    return {
      time,
      appointmentId: appt?.id ?? null,
      patientId: appt?.patientId ?? null,
      patientName: appt?.patientName ?? null,
      status: appt?.status ?? null,
      isLunchBreak: false,
    };
  });

  res.json({ professionalId: id, date, slots });
});

router.get("/professionals/:id/vacancy-alert", async (req, res) => {
  const id = Number(req.params.id);

  const [profForVacancy] = await db.select({ cargaHoraria: professionalsTable.cargaHoraria })
    .from(professionalsTable).where(eq(professionalsTable.id, id));
  const maxCapacityVacancy = getMaxCapacity(profForVacancy?.cargaHoraria ?? "30h");

  const activePatients = await db.select({ count: sql<number>`count(*)::int` })
    .from(patientsTable)
    .where(and(eq(patientsTable.professionalId, id), eq(patientsTable.status, "ativo")));
  const count = activePatients[0]?.count ?? 0;
  const available = Math.max(0, maxCapacityVacancy - count);

  let nextWaitingPatient = undefined;
  if (available > 0) {
    const waiting = await db.select({
      id: waitingListTable.id,
      patientId: waitingListTable.patientId,
      patientName: patientsTable.name,
      patientPhone: patientsTable.phone,
      professionalId: waitingListTable.professionalId,
      professionalName: professionalsTable.name,
      priority: waitingListTable.priority,
      notes: waitingListTable.notes,
      entryDate: waitingListTable.entryDate,
      createdAt: waitingListTable.createdAt,
      updatedAt: waitingListTable.updatedAt,
    })
      .from(waitingListTable)
      .leftJoin(patientsTable, eq(waitingListTable.patientId, patientsTable.id))
      .leftJoin(professionalsTable, eq(waitingListTable.professionalId, professionalsTable.id))
      .where(eq(waitingListTable.professionalId, id))
      .limit(1);
    if (waiting.length > 0) nextWaitingPatient = waiting[0];
  }

  res.json({
    professionalId: id,
    hasVacancy: available > 0,
    availableSlots: available,
    ...(nextWaitingPatient ? { nextWaitingPatient } : {}),
  });
});

export default router;
