import { Router } from "express";
import { db } from "@workspace/db";
import { notificacoesRecepcaoTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.post("/notificacoes", async (req, res) => {
  try {
    const { appointmentId, patientName, professionalName, acao, dataConsulta, horaConsulta } = req.body;
    if (!patientName || !acao) return res.status(400).json({ error: "patientName e acao são obrigatórios." });
    const [row] = await db.insert(notificacoesRecepcaoTable).values({
      appointmentId: appointmentId || null,
      patientName,
      professionalName: professionalName || "—",
      acao,
      dataConsulta: dataConsulta || "",
      horaConsulta: horaConsulta || "",
    }).returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/notificacoes", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificacoesRecepcaoTable)
      .orderBy(desc(notificacoesRecepcaoTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/notificacoes/:id/lido", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(notificacoesRecepcaoTable).set({ lido: true }).where(eq(notificacoesRecepcaoTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/notificacoes/lido-todas", async (_req, res) => {
  try {
    await db.update(notificacoesRecepcaoTable).set({ lido: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
