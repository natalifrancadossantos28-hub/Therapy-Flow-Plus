import { Router } from "express";
import { db, triagens } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";

const router = Router();

function getCompanyId(req: any): number | null {
  const h = req.headers["x-company-id"];
  if (!h) return null;
  const n = Number(h);
  return isNaN(n) ? null : n;
}

const extractFields = (body: any) => ({
  nome: body.nome,
  dataNascimento: body.dataNascimento,
  idade: body.idade,
  responsavel: body.responsavel,
  telefone: body.telefone,
  endereco: body.endereco,
  naturalidade: body.naturalidade,
  rg: body.rg,
  cpf: body.cpf,
  sus: body.sus,
  nomeMae: body.nomeMae,
  escolaridadeMae: body.escolaridadeMae,
  profissaoMae: body.profissaoMae,
  nomePai: body.nomePai,
  escolaridadePai: body.escolaridadePai,
  profissaoPai: body.profissaoPai,
  numIrmaos: body.numIrmaos,
  tipoImovel: body.tipoImovel,
  bolsaFamilia: !!body.bolsaFamilia,
  bpc: !!body.bpc,
  pensao: !!body.pensao,
  auxilioDoenca: !!body.auxilioDoenca,
  outrosAuxilios: body.outrosAuxilios,
  rendaFamiliar: body.rendaFamiliar,
  diagnostico: body.diagnostico,
  cid: body.cid,
  cid11: body.cid11,
  medico: body.medico,
  dataUltimaCons: body.dataUltimaCons,
  cadeiraDeRodas: !!body.cadeiraDeRodas,
  ortesesProteses: !!body.ortesesProteses,
  aparelhoAuditivo: !!body.aparelhoAuditivo,
  medicacaoContinua: body.medicacaoContinua,
  alergias: body.alergias,
  problemasSaude: body.problemasSaude,
  tipoEscola: body.tipoEscola,
  trabalhoPais: body.trabalhoPais,
  outroAtendimento: body.outroAtendimento !== undefined ? !!body.outroAtendimento : null,
  profissional: body.profissional,
  especialidade: body.especialidade,
  data: body.data,
  resultado: body.resultado,
  respostas: body.respostas ? JSON.stringify(body.respostas) : null,
});

router.get("/triagens", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const rows = companyId
      ? await db.select().from(triagens).where(eq(triagens.companyId, companyId)).orderBy(desc(triagens.createdAt))
      : await db.select().from(triagens).orderBy(desc(triagens.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar triagens" });
  }
});

router.get("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    const [row] = await db.select().from(triagens).where(and(...conditions));
    if (!row) return res.status(404).json({ error: "Triagem não encontrada" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar triagem" });
  }
});

router.post("/triagens", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const [row] = await db.insert(triagens).values({
      ...extractFields(req.body),
      ...(companyId ? { companyId } : {}),
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar triagem" });
  }
});

router.put("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    const [row] = await db
      .update(triagens)
      .set(extractFields(req.body))
      .where(and(...conditions))
      .returning();
    if (!row) return res.status(404).json({ error: "Triagem não encontrada" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar triagem" });
  }
});

router.delete("/triagens/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const conditions = [eq(triagens.id, Number(req.params.id))];
    if (companyId) conditions.push(eq(triagens.companyId, companyId));
    await db.delete(triagens).where(and(...conditions));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir triagem" });
  }
});

export default router;
