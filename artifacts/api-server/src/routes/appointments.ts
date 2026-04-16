import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appointmentsTable, patientsTable, professionalsTable } from "@workspace/db";
import { eq, and, gte, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function addWeeksToDate(dateStr: string, weeks: number): string {
  return addDaysToDate(dateStr, weeks * 7);
}

// ISO week number (1-53)
function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export { isoWeekNumber };

router.get("/appointments/today", async (req, res) => {
  const companyId = getCompanyId(req);
  const today = new Date().toISOString().split("T")[0];
  const conditions: any[] = [eq(appointmentsTable.date, today)];
  if (companyId) conditions.push(eq(appointmentsTable.companyId, companyId));
  if (req.query.professionalId) {
    conditions.push(eq(appointmentsTable.professionalId, Number(req.query.professionalId)));
  }

  // Exclude Censo Municipal patients from the agenda
  conditions.push(sql`(${patientsTable.tipoRegistro} IS NULL OR ${patientsTable.tipoRegistro} != 'Registro Censo Municipal')`);

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
    frequency: appointmentsTable.frequency,
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

  res.json(rows.map(r => {
    const ciclo = r.frequency === "quinzenal"
      ? (isoWeekNumber(r.date) % 2 === 1 ? "A" : "B")
      : r.frequency === "mensal" ? "M" : null;
    return {
      ...r,
      ciclo,
      patientName: r.patientName ?? "",
      patientPhone: r.patientPhone ?? null,
      patientAbsenceCount: r.patientAbsenceCount ?? 0,
      professionalName: r.professionalName ?? "",
      professionalSpecialty: r.professionalSpecialty ?? "",
    };
  }));
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

  const baseCondition = companyId
    ? and(eq(appointmentsTable.companyId, companyId), eq(appointmentsTable.status, "atendimento"))
    : eq(appointmentsTable.status, "atendimento");

  const rows = await db.select({ date: appointmentsTable.date }).from(appointmentsTable).where(baseCondition);

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

  // Exclude Censo Municipal patients from the agenda
  conditions.push(sql`(${patientsTable.tipoRegistro} IS NULL OR ${patientsTable.tipoRegistro} != 'Registro Censo Municipal')`);

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
      escolaPublica: patientsTable.escolaPublica,
      trabalhoNaRoca: patientsTable.trabalhoNaRoca,
      consecutiveUnjustifiedAbsences: patientsTable.consecutiveUnjustifiedAbsences,
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
    .where(and(...conditions));

  res.json(rows);
});

// GET /appointments/next — próximo agendamento futuro de um paciente/profissional
router.get("/appointments/next", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const conditions: any[] = [gte(appointmentsTable.date, today), eq(appointmentsTable.status, "agendado")];
  if (req.query.patientId) conditions.push(eq(appointmentsTable.patientId, Number(req.query.patientId)));
  if (req.query.professionalId) conditions.push(eq(appointmentsTable.professionalId, Number(req.query.professionalId)));

  const [next] = await db.select({
    id: appointmentsTable.id,
    date: appointmentsTable.date,
    time: appointmentsTable.time,
    frequency: appointmentsTable.frequency,
    patientId: appointmentsTable.patientId,
    professionalId: appointmentsTable.professionalId,
    patientName: patientsTable.name,
    professionalName: professionalsTable.name,
  })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
    .where(and(...conditions))
    .orderBy(appointmentsTable.date, appointmentsTable.time)
    .limit(1);

  if (!next) return res.json(null);

  // Calcula Semana A ou B
  const week = isoWeekNumber(next.date);
  const ciclo = (next.frequency === "quinzenal") ? (week % 2 === 1 ? "A" : "B") : null;
  res.json({ ...next, ciclo });
});

router.post("/appointments", async (req, res) => {
  const companyId = getCompanyId(req);
  const { patientId, professionalId, date, time, notes, fromWaitingList, noRecurrence, frequency } = req.body;

  if (patientId) {
    const [pt] = await db.select({ tipoRegistro: patientsTable.tipoRegistro })
      .from(patientsTable).where(eq(patientsTable.id, Number(patientId)));
    if (pt?.tipoRegistro === "Registro Censo Municipal") {
      return res.status(422).json({
        error: "Registro Censo Municipal",
        message: "Pacientes do Censo Municipal não podem ser agendados na agenda da clínica.",
      });
    }
  }

  const freq: "semanal" | "quinzenal" | "mensal" = frequency || "semanal";
  const recurrenceGroupId = randomUUID();

  let records: any[];
  if (noRecurrence) {
    records = [{
      patientId: Number(patientId),
      professionalId: Number(professionalId),
      date, time, status: "agendado" as const,
      notes: notes ?? null,
      recurrenceGroupId: null,
      frequency: freq,
      ...(companyId ? { companyId } : {}),
    }];
  } else {
    const stepDays = freq === "quinzenal" ? 14 : freq === "mensal" ? 28 : 7;
    const total = freq === "quinzenal" ? 26 : freq === "mensal" ? 13 : 52;
    records = Array.from({ length: total }, (_, i) => ({
      patientId: Number(patientId),
      professionalId: Number(professionalId),
      date: addDaysToDate(date, i * stepDays),
      time, status: "agendado" as const,
      notes: notes ?? null,
      recurrenceGroupId,
      frequency: freq,
      ...(companyId ? { companyId } : {}),
    }));
  }

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

  const ABSENCE_STATUSES = ["ausente", "falta_justificada", "falta_nao_justificada"];
  const wasAbsence = ABSENCE_STATUSES.includes(existing.status ?? "");
  const isAbsence  = ABSENCE_STATUSES.includes(status ?? "");

  let patientAfter: any = null;

  if (status && isAbsence && !wasAbsence) {
    // Registrar nova falta
    const [patient] = await db.select({
      absenceCount: patientsTable.absenceCount,
      consecutiveUnjustifiedAbsences: patientsTable.consecutiveUnjustifiedAbsences,
      escolaPublica: patientsTable.escolaPublica,
      trabalhoNaRoca: patientsTable.trabalhoNaRoca,
    }).from(patientsTable).where(eq(patientsTable.id, existing.patientId));

    const newAbsenceCount = (patient?.absenceCount ?? 0) + 1;
    let newConsecutive = patient?.consecutiveUnjustifiedAbsences ?? 0;

    if (status === "falta_nao_justificada" || status === "ausente") {
      newConsecutive += 1;
    } else if (status === "falta_justificada") {
      newConsecutive = 0; // justificada zera a sequência
    }

    const [updated] = await db.update(patientsTable)
      .set({ absenceCount: newAbsenceCount, consecutiveUnjustifiedAbsences: newConsecutive })
      .where(eq(patientsTable.id, existing.patientId))
      .returning();
    patientAfter = updated;

  } else if (wasAbsence && status && !isAbsence) {
    // Revertendo falta
    const [patient] = await db.select({
      absenceCount: patientsTable.absenceCount,
      consecutiveUnjustifiedAbsences: patientsTable.consecutiveUnjustifiedAbsences,
      escolaPublica: patientsTable.escolaPublica,
      trabalhoNaRoca: patientsTable.trabalhoNaRoca,
    }).from(patientsTable).where(eq(patientsTable.id, existing.patientId));

    const newAbsenceCount = Math.max(0, (patient?.absenceCount ?? 1) - 1);
    let newConsecutive = patient?.consecutiveUnjustifiedAbsences ?? 0;
    if (existing.status === "falta_nao_justificada" || existing.status === "ausente") {
      newConsecutive = Math.max(0, newConsecutive - 1);
    }

    const [updated] = await db.update(patientsTable)
      .set({ absenceCount: newAbsenceCount, consecutiveUnjustifiedAbsences: newConsecutive })
      .where(eq(patientsTable.id, existing.patientId))
      .returning();
    patientAfter = updated;
  }

  if (!patientAfter) {
    const [p] = await db.select({
      consecutiveUnjustifiedAbsences: patientsTable.consecutiveUnjustifiedAbsences,
      escolaPublica: patientsTable.escolaPublica,
      trabalhoNaRoca: patientsTable.trabalhoNaRoca,
    }).from(patientsTable).where(eq(patientsTable.id, existing.patientId));
    patientAfter = p;
  }

  res.json({
    ...row,
    consecutiveUnjustifiedAbsences: patientAfter?.consecutiveUnjustifiedAbsences ?? 0,
    escolaPublica: patientAfter?.escolaPublica ?? false,
    trabalhoNaRoca: patientAfter?.trabalhoNaRoca ?? false,
  });
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
