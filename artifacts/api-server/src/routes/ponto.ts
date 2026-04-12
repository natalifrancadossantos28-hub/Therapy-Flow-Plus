import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { pontoCompaniesTable, pontoEmployeesTable, pontoRecordsTable } from "@workspace/db";
import { eq, and, desc, sql, isNull, or } from "drizzle-orm";

const router: IRouter = Router();

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "nfs_master_2024";

// ── Auth helpers ──────────────────────────────────────────────────────────────
function isMaster(req: Request): boolean {
  return req.headers["x-master-auth"] === MASTER_PASSWORD;
}

function getCompanyId(req: Request): number | null {
  const h = req.headers["x-company-id"];
  if (h) return Number(h);
  return null;
}

async function isCompanyAdmin(req: Request, companyId: number): Promise<boolean> {
  if (isMaster(req)) return true;
  const auth = req.headers["x-company-auth"] as string | undefined;
  if (!auth) return false;
  const [c] = await db.select({ pw: pontoCompaniesTable.adminPassword })
    .from(pontoCompaniesTable).where(eq(pontoCompaniesTable.id, companyId));
  return c?.pw === auth;
}

// ── Schedule helpers ───────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function effectiveExitMinutes(exitTime: string, breakMinutes: number): number {
  return timeToMinutes(exitTime) - (60 - breakMinutes);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

router.post("/ponto/auth/master", (req, res) => {
  const { password } = req.body;
  if (password === MASTER_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: "Senha master incorreta." });
});

router.post("/ponto/auth/company", async (req, res) => {
  const { slug, password } = req.body;
  if (!slug || !password) return res.status(400).json({ error: "Slug e senha são obrigatórios." });
  const [company] = await db.select().from(pontoCompaniesTable)
    .where(and(eq(pontoCompaniesTable.slug, slug), eq(pontoCompaniesTable.active, true)));
  if (!company || company.adminPassword !== password) {
    return res.status(401).json({ error: "Empresa ou senha incorretos." });
  }
  const { adminPassword: _, ...safeCompany } = company;
  res.json(safeCompany);
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPANY MANAGEMENT (master only)
// ══════════════════════════════════════════════════════════════════════════════

router.get("/ponto/companies", async (req, res) => {
  if (!isMaster(req)) return res.status(403).json({ error: "Acesso negado." });
  const rows = await db.select({
    id: pontoCompaniesTable.id,
    name: pontoCompaniesTable.name,
    slug: pontoCompaniesTable.slug,
    active: pontoCompaniesTable.active,
    toleranceMinutes: pontoCompaniesTable.toleranceMinutes,
    overtimeBlockEnabled: pontoCompaniesTable.overtimeBlockEnabled,
    defaultBreakMinutes: pontoCompaniesTable.defaultBreakMinutes,
    logoUrl: pontoCompaniesTable.logoUrl,
    createdAt: pontoCompaniesTable.createdAt,
    employeeCount: sql<number>`(SELECT COUNT(*)::int FROM ponto_employees WHERE company_id = ponto_companies.id)`,
  }).from(pontoCompaniesTable).orderBy(pontoCompaniesTable.name);
  res.json(rows);
});

router.post("/ponto/companies", async (req, res) => {
  if (!isMaster(req)) return res.status(403).json({ error: "Acesso negado." });
  const { name, slug, adminPassword, toleranceMinutes, overtimeBlockEnabled, defaultBreakMinutes, logoUrl } = req.body;
  const exists = await db.select({ id: pontoCompaniesTable.id })
    .from(pontoCompaniesTable).where(eq(pontoCompaniesTable.slug, slug));
  if (exists.length > 0) return res.status(409).json({ error: "Slug já em uso." });
  const [row] = await db.insert(pontoCompaniesTable).values({
    name,
    slug: slug.toLowerCase(),
    adminPassword: adminPassword || "admin123",
    toleranceMinutes: toleranceMinutes !== undefined ? Number(toleranceMinutes) : 10,
    overtimeBlockEnabled: overtimeBlockEnabled !== undefined ? Boolean(overtimeBlockEnabled) : true,
    defaultBreakMinutes: defaultBreakMinutes !== undefined ? Number(defaultBreakMinutes) : 60,
    logoUrl: logoUrl ?? null,
  }).returning();
  const { adminPassword: _, ...safe } = row;
  res.status(201).json(safe);
});

router.put("/ponto/companies/:id", async (req, res) => {
  if (!isMaster(req)) return res.status(403).json({ error: "Acesso negado." });
  const id = Number(req.params.id);
  const { name, slug, adminPassword, toleranceMinutes, overtimeBlockEnabled, defaultBreakMinutes, active, logoUrl } = req.body;
  const upd: Record<string, unknown> = {};
  if (name !== undefined) upd.name = name;
  if (slug !== undefined) upd.slug = slug.toLowerCase();
  if (adminPassword !== undefined && adminPassword !== "") upd.adminPassword = adminPassword;
  if (toleranceMinutes !== undefined) upd.toleranceMinutes = Number(toleranceMinutes);
  if (overtimeBlockEnabled !== undefined) upd.overtimeBlockEnabled = Boolean(overtimeBlockEnabled);
  if (defaultBreakMinutes !== undefined) upd.defaultBreakMinutes = Number(defaultBreakMinutes);
  if (active !== undefined) upd.active = Boolean(active);
  if (logoUrl !== undefined) upd.logoUrl = logoUrl || null;
  const [row] = await db.update(pontoCompaniesTable).set(upd).where(eq(pontoCompaniesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Empresa não encontrada." });
  const { adminPassword: _, ...safe } = row;
  res.json(safe);
});

router.delete("/ponto/companies/:id", async (req, res) => {
  if (!isMaster(req)) return res.status(403).json({ error: "Acesso negado." });
  const id = Number(req.params.id);
  const emps = await db.select({ id: pontoEmployeesTable.id })
    .from(pontoEmployeesTable).where(eq(pontoEmployeesTable.companyId, id));
  for (const emp of emps) {
    await db.delete(pontoRecordsTable).where(eq(pontoRecordsTable.employeeId, emp.id));
  }
  await db.delete(pontoEmployeesTable).where(eq(pontoEmployeesTable.companyId, id));
  await db.delete(pontoCompaniesTable).where(eq(pontoCompaniesTable.id, id));
  res.status(204).send();
});

// Public: get company by slug (used by kiosk)
router.get("/ponto/companies/slug/:slug", async (req, res) => {
  const [company] = await db.select({
    id: pontoCompaniesTable.id,
    name: pontoCompaniesTable.name,
    slug: pontoCompaniesTable.slug,
    logoUrl: pontoCompaniesTable.logoUrl,
    active: pontoCompaniesTable.active,
  }).from(pontoCompaniesTable)
    .where(and(eq(pontoCompaniesTable.slug, req.params.slug), eq(pontoCompaniesTable.active, true)));
  if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
  res.json(company);
});

// Company settings (company admin or master)
router.get("/ponto/companies/:id/settings", async (req, res) => {
  const id = Number(req.params.id);
  if (!isMaster(req) && !(await isCompanyAdmin(req, id))) {
    return res.status(403).json({ error: "Acesso negado." });
  }
  const [row] = await db.select({
    id: pontoCompaniesTable.id,
    name: pontoCompaniesTable.name,
    slug: pontoCompaniesTable.slug,
    toleranceMinutes: pontoCompaniesTable.toleranceMinutes,
    overtimeBlockEnabled: pontoCompaniesTable.overtimeBlockEnabled,
    defaultBreakMinutes: pontoCompaniesTable.defaultBreakMinutes,
    active: pontoCompaniesTable.active,
    logoUrl: pontoCompaniesTable.logoUrl,
  }).from(pontoCompaniesTable).where(eq(pontoCompaniesTable.id, id));
  if (!row) return res.status(404).json({ error: "Empresa não encontrada." });
  res.json(row);
});

router.put("/ponto/companies/:id/settings", async (req, res) => {
  const id = Number(req.params.id);
  if (!isMaster(req) && !(await isCompanyAdmin(req, id))) {
    return res.status(403).json({ error: "Acesso negado." });
  }
  const { name, adminPassword, toleranceMinutes, overtimeBlockEnabled, defaultBreakMinutes, logoUrl } = req.body;
  const upd: Record<string, unknown> = {};
  if (name !== undefined) upd.name = name;
  if (adminPassword !== undefined && adminPassword !== "") upd.adminPassword = adminPassword;
  if (toleranceMinutes !== undefined) upd.toleranceMinutes = Number(toleranceMinutes);
  if (overtimeBlockEnabled !== undefined) upd.overtimeBlockEnabled = Boolean(overtimeBlockEnabled);
  if (defaultBreakMinutes !== undefined) upd.defaultBreakMinutes = Number(defaultBreakMinutes);
  if (logoUrl !== undefined) upd.logoUrl = logoUrl || null;
  const [row] = await db.update(pontoCompaniesTable).set(upd).where(eq(pontoCompaniesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Empresa não encontrada." });
  const { adminPassword: _, ...safe } = row;
  res.json(safe);
});

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════════════════════════

router.get("/ponto/employees", async (req, res) => {
  const companyId = getCompanyId(req);
  if (!companyId && !isMaster(req)) return res.status(400).json({ error: "Company ID obrigatório." });
  const rows = companyId
    ? await db.select().from(pontoEmployeesTable)
        .where(eq(pontoEmployeesTable.companyId, companyId))
        .orderBy(pontoEmployeesTable.name)
    : await db.select().from(pontoEmployeesTable).orderBy(pontoEmployeesTable.name);
  res.json(rows);
});

router.post("/ponto/employees", async (req, res) => {
  const companyId = getCompanyId(req);
  if (!companyId) return res.status(400).json({ error: "Company ID obrigatório." });
  if (!(await isCompanyAdmin(req, companyId))) return res.status(403).json({ error: "Acesso negado." });

  const { name, cpf, role, photo, weeklyHours, active, entryTime, exitTime, breakMinutes } = req.body;
  const cleanCpf = cpf.replace(/\D/g, "");

  const existing = await db.select({ id: pontoEmployeesTable.id })
    .from(pontoEmployeesTable)
    .where(and(eq(pontoEmployeesTable.cpf, cleanCpf), eq(pontoEmployeesTable.companyId, companyId)));
  if (existing.length > 0) return res.status(409).json({ error: "CPF já cadastrado nesta empresa." });

  const [row] = await db.insert(pontoEmployeesTable).values({
    companyId,
    name,
    cpf: cleanCpf,
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
  const companyId = getCompanyId(req);
  const condition = companyId
    ? and(eq(pontoEmployeesTable.cpf, cpf), eq(pontoEmployeesTable.companyId, companyId))
    : eq(pontoEmployeesTable.cpf, cpf);
  const [row] = await db.select().from(pontoEmployeesTable).where(condition);
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.get("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const condition = companyId
    ? and(eq(pontoEmployeesTable.id, id), eq(pontoEmployeesTable.companyId, companyId))
    : eq(pontoEmployeesTable.id, id);
  const [row] = await db.select().from(pontoEmployeesTable).where(condition);
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.put("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  if (!companyId) return res.status(400).json({ error: "Company ID obrigatório." });
  if (!(await isCompanyAdmin(req, companyId))) return res.status(403).json({ error: "Acesso negado." });

  const { name, cpf, role, photo, weeklyHours, active, entryTime, exitTime, breakMinutes } = req.body;
  const upd: Record<string, unknown> = {};
  if (name !== undefined) upd.name = name;
  if (cpf !== undefined) upd.cpf = cpf.replace(/\D/g, "");
  if (role !== undefined) upd.role = role;
  if (photo !== undefined) upd.photo = photo;
  if (weeklyHours !== undefined) upd.weeklyHours = Number(weeklyHours);
  if (active !== undefined) upd.active = active;
  if (entryTime !== undefined) upd.entryTime = entryTime || null;
  if (exitTime !== undefined) upd.exitTime = exitTime || null;
  if (breakMinutes !== undefined) upd.breakMinutes = Number(breakMinutes);

  const [row] = await db.update(pontoEmployeesTable).set(upd)
    .where(and(eq(pontoEmployeesTable.id, id), eq(pontoEmployeesTable.companyId, companyId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Funcionário não encontrado" });
  res.json(row);
});

router.delete("/ponto/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  if (!companyId) return res.status(400).json({ error: "Company ID obrigatório." });
  if (!(await isCompanyAdmin(req, companyId))) return res.status(403).json({ error: "Acesso negado." });

  await db.delete(pontoRecordsTable).where(eq(pontoRecordsTable.employeeId, id));
  await db.delete(pontoEmployeesTable)
    .where(and(eq(pontoEmployeesTable.id, id), eq(pontoEmployeesTable.companyId, companyId)));
  res.status(204).send();
});

// ══════════════════════════════════════════════════════════════════════════════
// RECORDS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/ponto/records/summary", async (req, res) => {
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().split("T")[0];
  const employeeIdFilter = req.query.employeeId ? Number(req.query.employeeId) : null;
  const companyId = getCompanyId(req);

  const conditions: any[] = [eq(pontoRecordsTable.date, date)];
  if (employeeIdFilter) conditions.push(eq(pontoRecordsTable.employeeId, employeeIdFilter));
  if (companyId) conditions.push(eq(pontoEmployeesTable.companyId, companyId));

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
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(pontoRecordsTable.employeeId, pontoRecordsTable.punchedAt);

  const grouped: Record<number, any> = {};
  for (const r of records) {
    const eid = r.employeeId;
    if (!grouped[eid]) {
      grouped[eid] = {
        employeeId: eid, employeeName: r.employeeName ?? "",
        employeePhoto: r.employeePhoto ?? null, role: r.role ?? "",
        date, records: [], totalHours: null,
      };
    }
    grouped[eid].records.push(r);
  }
  for (const s of Object.values(grouped)) {
    const entradas = s.records.filter((r: any) => r.type === "entrada").map((r: any) => new Date(r.punchedAt!).getTime());
    const saidas = s.records.filter((r: any) => r.type === "saida").map((r: any) => new Date(r.punchedAt!).getTime());
    let totalMs = 0;
    const pairs = Math.min(entradas.length, saidas.length);
    for (let i = 0; i < pairs; i++) totalMs += saidas[i] - entradas[i];
    if (pairs > 0) {
      const h = Math.floor(totalMs / 3600000);
      const m = Math.floor((totalMs % 3600000) / 60000);
      s.totalHours = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  res.json(Object.values(grouped));
});

router.get("/ponto/records", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const date = req.query.date ? String(req.query.date) : null;
  const companyId = getCompanyId(req);

  const conditions: any[] = [];
  if (employeeId) conditions.push(eq(pontoRecordsTable.employeeId, employeeId));
  if (date) conditions.push(eq(pontoRecordsTable.date, date));
  if (companyId) conditions.push(eq(pontoEmployeesTable.companyId, companyId));

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

  res.json(rows.map(r => ({ ...r, employeeName: r.employeeName ?? "", employeePhoto: r.employeePhoto ?? null })));
});

router.post("/ponto/records", async (req, res) => {
  const { employeeId, type } = req.body;
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const companyId = getCompanyId(req);

  const condition = companyId
    ? and(eq(pontoEmployeesTable.id, Number(employeeId)), eq(pontoEmployeesTable.companyId, companyId))
    : eq(pontoEmployeesTable.id, Number(employeeId));
  const [employee] = await db.select().from(pontoEmployeesTable).where(condition);
  if (!employee) return res.status(404).json({ error: "Funcionário não encontrado" });

  // Get company settings for validation
  let tolerance = 10;
  let overtimeBlockEnabled = true;
  if (employee.companyId) {
    const [company] = await db.select({
      toleranceMinutes: pontoCompaniesTable.toleranceMinutes,
      overtimeBlockEnabled: pontoCompaniesTable.overtimeBlockEnabled,
    }).from(pontoCompaniesTable).where(eq(pontoCompaniesTable.id, employee.companyId));
    if (company) {
      tolerance = company.toleranceMinutes;
      overtimeBlockEnabled = company.overtimeBlockEnabled;
    }
  }

  // Schedule validation using company-level tolerance settings
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (type === "entrada" && employee.entryTime) {
    const earliest = timeToMinutes(employee.entryTime) - tolerance;
    if (nowMinutes < earliest) {
      return res.status(422).json({
        error: `Muito cedo para registrar. A entrada é liberada a partir das ${minutesToTime(earliest)}.`,
      });
    }
  }

  if (type === "saida" && employee.exitTime && overtimeBlockEnabled) {
    const effExit = effectiveExitMinutes(employee.exitTime, employee.breakMinutes ?? 60);
    const deadline = effExit + tolerance;
    if (nowMinutes > deadline) {
      return res.status(422).json({
        error: `Horário limite de saída excedido. Procure a administração para autorizar hora extra.`,
        detail: `Saída prevista: ${minutesToTime(effExit)} · Limite: ${minutesToTime(deadline)}`,
      });
    }
  }

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
