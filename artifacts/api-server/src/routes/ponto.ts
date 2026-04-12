import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pontoEmployeesTable, pontoRecordsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

// ── Schedule helpers ──────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
// Effective exit = scheduled exit adjusted for break duration
// (standard break assumed = 60 min; shorter break means earlier exit)
function effectiveExitMinutes(exitTime: string, breakMinutes: number): number {
  return timeToMinutes(exitTime) - (60 - breakMinutes);
}

router.get("/ponto/employees", async (req, res) => {
  const rows = await db.select().from(pontoEmployeesTable).orderBy(pontoEmployeesTable.name);
  res.json(rows);
});

router.post("/ponto/employees", async (req, res) => {
  const { name, cpf, role, photo, weeklyHours, active, entryTime, exitTime, breakMinutes } = req.body;
  const [row] = await db.insert(pontoEmployeesTable).values({
    name,
    cpf: cpf.replace(/\D/g, ""),
    role,
    photo: photo ?? null,
    weeklyHours: weeklyHours !== undefined ? Number(weeklyHours) : 44,
    active: active !== undefined ? active : true,
    entryTime: entryTime ?? null,
    exitTime: exitTime ?? null,
    breakMinutes: breakMinutes !== undefined ? Number(breakMinutes) : 60,
  }).returning();
  res.status(201).json(row);
});

router.get("/ponto/employees/cpf/:cpf", async (req, res) => {
  const cpf = req.params.cpf.replace(/\D/g, "");
  const [row] = await db.select().from(pontoEmployeesTable).where(eq(pontoEmployeesTable.cpf, cpf));
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.get("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(pontoEmployeesTable).where(eq(pontoEmployeesTable.id, id));
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.put("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, cpf, role, photo, weeklyHours, active, entryTime, exitTime, breakMinutes } = req.body;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (cpf !== undefined) updateData.cpf = cpf.replace(/\D/g, "");
  if (role !== undefined) updateData.role = role;
  if (photo !== undefined) updateData.photo = photo;
  if (weeklyHours !== undefined) updateData.weeklyHours = Number(weeklyHours);
  if (active !== undefined) updateData.active = active;
  if (entryTime !== undefined) updateData.entryTime = entryTime || null;
  if (exitTime !== undefined) updateData.exitTime = exitTime || null;
  if (breakMinutes !== undefined) updateData.breakMinutes = Number(breakMinutes);

  const [row] = await db.update(pontoEmployeesTable).set(updateData).where(eq(pontoEmployeesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.delete("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(pontoRecordsTable).where(eq(pontoRecordsTable.employeeId, id));
  await db.delete(pontoEmployeesTable).where(eq(pontoEmployeesTable.id, id));
  res.status(204).send();
});

router.get("/ponto/records/summary", async (req, res) => {
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().split("T")[0];
  const employeeIdFilter = req.query.employeeId ? Number(req.query.employeeId) : null;

  const conditions = [eq(pontoRecordsTable.date, date)];
  if (employeeIdFilter) {
    conditions.push(eq(pontoRecordsTable.employeeId, employeeIdFilter));
  }

  const records = await db.select({
    id: pontoRecordsTable.id,
    employeeId: pontoRecordsTable.employeeId,
    employeeName: pontoEmployeesTable.name,
    employeePhoto: pontoEmployeesTable.photo,
    role: pontoEmployeesTable.role,
    type: pontoRecordsTable.type,
    punchedAt: pontoRecordsTable.punchedAt,
    date: pontoRecordsTable.date,
    createdAt: pontoRecordsTable.createdAt,
  })
    .from(pontoRecordsTable)
    .leftJoin(pontoEmployeesTable, eq(pontoRecordsTable.employeeId, pontoEmployeesTable.id))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(pontoRecordsTable.employeeId, pontoRecordsTable.punchedAt);

  const grouped: Record<number, {
    employeeId: number;
    employeeName: string;
    employeePhoto: string | null;
    role: string;
    date: string;
    records: typeof records;
    totalHours: string | null;
  }> = {};

  for (const r of records) {
    const eid = r.employeeId;
    if (!grouped[eid]) {
      grouped[eid] = {
        employeeId: eid,
        employeeName: r.employeeName ?? "",
        employeePhoto: r.employeePhoto ?? null,
        role: r.role ?? "",
        date,
        records: [],
        totalHours: null,
      };
    }
    grouped[eid].records.push(r as any);
  }

  for (const summary of Object.values(grouped)) {
    const entradas = summary.records.filter(r => r.type === "entrada").map(r => new Date(r.punchedAt!).getTime());
    const saidas = summary.records.filter(r => r.type === "saida").map(r => new Date(r.punchedAt!).getTime());
    let totalMs = 0;
    const pairs = Math.min(entradas.length, saidas.length);
    for (let i = 0; i < pairs; i++) {
      totalMs += saidas[i] - entradas[i];
    }
    if (pairs > 0) {
      const h = Math.floor(totalMs / 3600000);
      const m = Math.floor((totalMs % 3600000) / 60000);
      summary.totalHours = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  res.json(Object.values(grouped));
});

router.get("/ponto/records", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const date = req.query.date ? String(req.query.date) : null;

  const conditions = [];
  if (employeeId) conditions.push(eq(pontoRecordsTable.employeeId, employeeId));
  if (date) conditions.push(eq(pontoRecordsTable.date, date));

  const rows = await db.select({
    id: pontoRecordsTable.id,
    employeeId: pontoRecordsTable.employeeId,
    employeeName: pontoEmployeesTable.name,
    employeePhoto: pontoEmployeesTable.photo,
    type: pontoRecordsTable.type,
    punchedAt: pontoRecordsTable.punchedAt,
    date: pontoRecordsTable.date,
    createdAt: pontoRecordsTable.createdAt,
  })
    .from(pontoRecordsTable)
    .leftJoin(pontoEmployeesTable, eq(pontoRecordsTable.employeeId, pontoEmployeesTable.id))
    .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(pontoRecordsTable.punchedAt));

  res.json(rows.map(r => ({
    ...r,
    employeeName: r.employeeName ?? "",
    employeePhoto: r.employeePhoto ?? null,
  })));
});

router.post("/ponto/records", async (req, res) => {
  const { employeeId, type } = req.body;
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  const [employee] = await db.select().from(pontoEmployeesTable).where(eq(pontoEmployeesTable.id, Number(employeeId)));
  if (!employee) return res.status(404).json({ error: "Funcionário não encontrado" });

  // ── Schedule validation ───────────────────────────────────────────────────
  // Use local time in Brazil (UTC-3) for clock checks
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const TOLERANCE = 10; // minutes

  if (type === "entrada" && employee.entryTime) {
    const earliest = timeToMinutes(employee.entryTime) - TOLERANCE;
    if (nowMinutes < earliest) {
      return res.status(422).json({
        error: `Muito cedo para registrar. A entrada é liberada a partir das ${minutesToTime(earliest)}.`,
      });
    }
  }

  if (type === "saida" && employee.exitTime) {
    const effExit = effectiveExitMinutes(employee.exitTime, employee.breakMinutes ?? 60);
    const deadline = effExit + TOLERANCE;
    if (nowMinutes > deadline) {
      return res.status(422).json({
        error: `Horário limite de saída excedido. Procure a administração para autorizar hora extra.`,
        detail: `Saída prevista: ${minutesToTime(effExit)} · Limite: ${minutesToTime(deadline)}`,
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [row] = await db.insert(pontoRecordsTable).values({
    employeeId: Number(employeeId),
    type: type ?? "entrada",
    punchedAt: now,
    date,
  }).returning();

  res.status(201).json({
    ...row,
    employeeName: employee.name,
    employeePhoto: employee.photo ?? null,
  });
});

export default router;
