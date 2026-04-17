import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { contractorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

router.get("/contractors", async (req, res) => {
  const companyId = getCompanyId(req);
  const rows = companyId
    ? await db.select().from(contractorsTable).where(eq(contractorsTable.companyId, companyId))
    : await db.select().from(contractorsTable);
  res.json(rows);
});

router.post("/contractors", async (req, res) => {
  const companyId = getCompanyId(req);
  const { name, valorPorAtendimento } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name é obrigatório" });
  }
  const [row] = await db.insert(contractorsTable).values({
    name: name.trim(),
    valorPorAtendimento: Number(valorPorAtendimento) || 30,
    ...(companyId ? { companyId } : {}),
  }).returning();
  res.status(201).json(row);
});

router.put("/contractors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const { name, valorPorAtendimento } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name é obrigatório" });
  }
  const condition = companyId
    ? and(eq(contractorsTable.id, id), eq(contractorsTable.companyId, companyId))
    : eq(contractorsTable.id, id);
  const [row] = await db.update(contractorsTable)
    .set({ name: name.trim(), valorPorAtendimento: Number(valorPorAtendimento) || 30 })
    .where(condition!)
    .returning();
  if (!row) return res.status(404).json({ error: "Contratante não encontrado" });
  res.json(row);
});

router.delete("/contractors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const companyId = getCompanyId(req);
  const condition = companyId
    ? and(eq(contractorsTable.id, id), eq(contractorsTable.companyId, companyId))
    : eq(contractorsTable.id, id);
  await db.delete(contractorsTable).where(condition!);
  res.status(204).send();
});

export default router;
