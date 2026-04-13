import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appointmentsTable, patientsTable, professionalsTable } from "@workspace/db";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

function addWeeksToDate(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + weeks * 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

router.get("/appointments/today", async (req, res) => {
  const companyId = getCompanyId(req);
  const today = new Date().toISOString().split("T")[0];
  const conditions: any[] = [eq(appointmentsTable.date, today)];
  if (companyId) conditions.push(eq(appointmentsTable.companyId, companyId));
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
    recurrenceGroupId: appointmentsTable.recurrenceGroupId,
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

router.get("/appointments/stats", async (req, res) => {
  const companyId = getCompanyId(req);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
  const monthStart = new Date(y, m, 1);
  const trimStart = new Date(y, m - 2, 1);
  const semStart = new Date(y, m - 5, 1);
  const yearStart = new Date(y, 0, 1);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const rows = companyId
    ? await db.select({ date: appointmentsTable.date }).from(appointmentsTable).where(eq(appointmentsTable.companyId, companyId))
    : await db.select({ date: appointmentsTable.date }).from(appointmentsTable);

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
  const companyId = getCompanyId(req);
  const conditions: any[] = [];
  if (companyId) conditions.push(eq(appointmentsTable.companyId, companyId));
  if (req.query.date) conditions.push(eq(appointmentsTable.date, String(req.query.date)));
  if (req.query.professionalId) conditions.push(eq(appointmentsTable.professionalId, Number(req.query.professionalId)));
  if (req.query.patientId) conditions.push(eq(appointmentsTable.patientId, Number(req.query.patientId)));
  if (req.query.dateFrom) conditions.push(gte(appointmentsTable.date, String(req.query.dateFrom)));
  if (req.query.dateTo) conditions.push(lte(appointmentsTable.date, String(req.query.dateTo)));

  const rows = await db
    .select({
      id: appointmentsTable.id,
      patientId: appointmentsTable.patientId,
      professionalId: appointmentsTable.professionalId,
      date: appointmentsTable.date,
      time: appointmentsTable.time,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      rescheduledTo: appointmentsTable.rescheduledTo,
      recurrenceGroupId: appointmentsTable.recurrenceGroupId,
      companyId: appointmentsTable.companyId,
      createdAt: appointmentsTable.createdAt,
      updatedAt: appointmentsTable.updatedAt,
      patientName: patientsTable.name,
      guardianName: patientsTable.guardianName,
      guardianPhone: patientsTable.guardianPhone,
      professionalName: professionalsTable.name,
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
    .where(conditions.length ? and(...conditions) : undefined);

  res.json(rows);
});

router.post("/appointments", async (req, res) => {
  const companyId = getCompanyId(req);
  const { patientId, professionalId, date, time, notes, fromWaitingList, noRecurrence } = req.body;

  const recurrenceGroupId = randomUUID();
  const WEEKS = noRecurrence ? 1 : 52;

  const records = Array.from({ length: WEEKS }, (_, i) => ({
    patientId: Number(patientId),
    professionalId: Number(professionalId),
    date: addWeeksToDate(date, i),
    time,
    status: "agendado" as const,
    notes: notes ?? null,
    recurrenceGroupId: WEEKS > 1 ? recurrenceGroupId : null,
    ...(companyId ? { companyId } : {}),
  }));

  const inserted = await db.insert(appointmentsTable).values(records).returning();
  const firstRow = inserted[0];

  if (fromWaitingList) {
    await db.update(patientsTable)
      .set({ status: "Atendimento", professionalId: Number(professionalId) })
      .where(eq(patientsTable.id, Number(patientId)));

    const { waitingListTable } = await import("@workspace/db");
    await db.delete(waitingListTable).where(eq(waitingListTable.patientId, Number(patientId)));
  }

  res.status(201).json({ ...firstRow, totalCreated: inserted.length });
});

router.get("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!row) return res.status(404).json({ error: "Appointment not found" });
  res.json(row);
});

router.patch("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status, rescheduledTo, notes, date, time } = req.body;

  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Appointment not found" });

  const updateData: any = {};
  if (status !== undefined) updateData.status = status;
  if (rescheduledTo !== undefined) updateData.rescheduledTo = rescheduledTo;
  if (notes !== undefined) updateData.notes = notes;
  if (date !== undefined) updateData.date = date;
  if (time !== undefined) updateData.time = time;

  const [row] = await db.update(appointmentsTable)
    .set(updateData)
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (status === "ausente" && existing.status !== "ausente") {
    const [patient] = await db.select({ absenceCount: patientsTable.absenceCount })
      .from(patientsTable).where(eq(patientsTable.id, existing.patientId));
    const newCount = (patient?.absenceCount ?? 0) + 1;
    await db.update(patientsTable).set({ absenceCount: newCount }).where(eq(patientsTable.id, existing.patientId));
  } else if (existing.status === "ausente" && status !== "ausente") {
    const [patient] = await db.select({ absenceCount: patientsTable.absenceCount })
      .from(patientsTable).where(eq(patientsTable.id, existing.patientId));
    const newCount = Math.max(0, (patient?.absenceCount ?? 1) - 1);
    await db.update(patientsTable).set({ absenceCount: newCount }).where(eq(patientsTable.id, existing.patientId));
  }

  res.json(row);
});

router.delete("/appointments/:id/alta", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Appointment not found" });

  let deletedCount = 0;

  if (existing.recurrenceGroupId) {
    const future = await db.select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.recurrenceGroupId, existing.recurrenceGroupId),
          gte(appointmentsTable.date, existing.date)
        )
      );
    for (const row of future) {
      await db.delete(appointmentsTable).where(eq(appointmentsTable.id, row.id));
    }
    deletedCount = future.length;
  } else {
    await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
    deletedCount = 1;
  }

  res.json({ ok: true, deletedCount });
});

router.delete("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.status(204).send();
});

export default router;
