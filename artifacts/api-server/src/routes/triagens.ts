import { Router } from "express";
import { db, triagens } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.get("/triagens", async (_req, res) => {
  try {
    const rows = await db.select().from(triagens).orderBy(desc(triagens.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar triagens" });
  }
});

router.post("/triagens", async (req, res) => {
  try {
    const {
      nome, dataNascimento, idade, responsavel, telefone, endereco,
      naturalidade, rg, sus, nomeMae, profissaoMae, nomePai, profissaoPai,
      numIrmaos, tipoImovel, bolsaFamilia, bpc,
      diagnostico, cid, medico, dataUltimaCons,
      profissional, especialidade, data, resultado,
    } = req.body;
    const [row] = await db
      .insert(triagens)
      .values({
        nome, dataNascimento, idade, responsavel, telefone, endereco,
        naturalidade, rg, sus, nomeMae, profissaoMae, nomePai, profissaoPai,
        numIrmaos, tipoImovel, bolsaFamilia: !!bolsaFamilia, bpc: !!bpc,
        diagnostico, cid, medico, dataUltimaCons,
        profissional, especialidade, data, resultado,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar triagem" });
  }
});

router.delete("/triagens/:id", async (req, res) => {
  try {
    await db.delete(triagens).where(eq(triagens.id, Number(req.params.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir triagem" });
  }
});

export default router;
