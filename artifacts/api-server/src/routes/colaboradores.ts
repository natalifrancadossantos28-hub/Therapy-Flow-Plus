import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { colaboradoresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

router.get("/colaboradores", async (req, res) => {
  const companyId = getCompanyId(req);
  const rows = companyId
    ? await db.select().from(colaboradoresTable).where(eq(colaboradoresTable.companyId, companyId))
    : await db.select().from(colaboradoresTable);
  res.json(rows);
});

router.post("/colaboradores", async (req, res) => {
  const companyId = getCompanyId(req);
  const { name, cargo, salario } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name é obrigatório" });
  const [row] = await db.insert(colaboradoresTable).values({
    name: name.trim(),
    cargo: cargo?.trim() || "ADM",
    salario: Number(salario) || 0,
    ...(companyId ? { companyId } : {}),
  }).returning();
  res.status(201).json(row);
});

router.put("/colaboradores/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const { name, cargo, salario } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name é obrigatório" });
  const condition = companyId
    ? and(eq(colaboradoresTable.id, id), eq(colaboradoresTable.companyId, companyId))
    : eq(colaboradoresTable.id, id);
  const [row] = await db.update(colaboradoresTable)
    .set({ name: name.trim(), cargo: cargo?.trim() || "ADM", salario: Number(salario) || 0 })
    .where(condition!)
    .returning();
  if (!row) return res.status(404).json({ error: "Colaborador não encontrado" });
  res.json(row);
});

router.delete("/colaboradores/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const condition = companyId
    ? and(eq(colaboradoresTable.id, id), eq(colaboradoresTable.companyId, companyId))
    : eq(colaboradoresTable.id, id);
  await db.delete(colaboradoresTable).where(condition!);
  res.status(204).send();
});

export default router;
