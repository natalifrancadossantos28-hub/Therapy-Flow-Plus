import { Router } from "express";
import { db } from "@workspace/db";
import { nfsErrorLogsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";

const router = Router();

const MASTER_PASSWORD = process.env.MASTER_PASSWORD ?? "nfs_master_2024";

function isMaster(req: any): boolean {
  return req.headers["x-master-auth"] === MASTER_PASSWORD;
}

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

router.post("/error-logs", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { app, errorMessage, errorStack, url, userAgent, context } = req.body;

    if (!app || !errorMessage) {
      return res.status(400).json({ error: "app e errorMessage são obrigatórios" });
    }

    const [row] = await db.insert(nfsErrorLogsTable).values({
      companyId: companyId ?? null,
      app: String(app),
      errorMessage: String(errorMessage),
      errorStack: errorStack ? String(errorStack) : null,
      url: url ? String(url) : null,
      userAgent: userAgent ? String(userAgent) : null,
      context: context ? JSON.stringify(context) : null,
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar log" });
  }
});

router.get("/error-logs", async (req, res) => {
  try {
    if (!isMaster(req)) {
      return res.status(401).json({ error: "Acesso negado" });
    }

    const conditions = [];
    if (req.query.companyId) {
      conditions.push(eq(nfsErrorLogsTable.companyId, Number(req.query.companyId)));
    }
    if (req.query.app) {
      conditions.push(eq(nfsErrorLogsTable.app, String(req.query.app)));
    }

    const rows = conditions.length
      ? await db.select().from(nfsErrorLogsTable).where(and(...conditions)).orderBy(desc(nfsErrorLogsTable.createdAt)).limit(200)
      : await db.select().from(nfsErrorLogsTable).orderBy(desc(nfsErrorLogsTable.createdAt)).limit(200);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar logs" });
  }
});

router.delete("/error-logs/:id", async (req, res) => {
  try {
    if (!isMaster(req)) return res.status(401).json({ error: "Acesso negado" });
    await db.delete(nfsErrorLogsTable).where(eq(nfsErrorLogsTable.id, Number(req.params.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir log" });
  }
});

export default router;
