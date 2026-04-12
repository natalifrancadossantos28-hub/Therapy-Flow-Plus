import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const triagens = pgTable("triagens", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  dataNascimento: text("data_nascimento"),
  idade: text("idade"),
  responsavel: text("responsavel"),
  telefone: text("telefone"),
  endereco: text("endereco"),
  naturalidade: text("naturalidade"),
  rg: text("rg"),
  cpf: text("cpf"),
  sus: text("sus"),
  // Núcleo familiar
  nomeMae: text("nome_mae"),
  escolaridadeMae: text("escolaridade_mae"),
  profissaoMae: text("profissao_mae"),
  nomePai: text("nome_pai"),
  escolaridadePai: text("escolaridade_pai"),
  profissaoPai: text("profissao_pai"),
  numIrmaos: text("num_irmaos"),
  tipoImovel: text("tipo_imovel"),
  // Benefícios sociais
  bolsaFamilia: boolean("bolsa_familia").default(false),
  bpc: boolean("bpc").default(false),
  pensao: boolean("pensao").default(false),
  auxilioDoenca: boolean("auxilio_doenca").default(false),
  outrosAuxilios: text("outros_auxilios"),
  rendaFamiliar: text("renda_familiar"),
  // Dados de saúde
  diagnostico: text("diagnostico"),
  cid: text("cid"),
  cid11: text("cid_11"),
  medico: text("medico"),
  dataUltimaCons: text("data_ultima_cons"),
  // Dispositivos de apoio
  cadeiraDeRodas: boolean("cadeira_de_rodas").default(false),
  ortesesProteses: boolean("orteses_proteses").default(false),
  aparelhoAuditivo: boolean("aparelho_auditivo").default(false),
  // Alertas críticos
  medicacaoContinua: text("medicacao_continua"),
  alergias: text("alergias"),
  problemasSaude: text("problemas_saude"),
  // Contexto socioeconômico
  tipoEscola: text("tipo_escola"),
  trabalhoPais: text("trabalho_pais"),
  outroAtendimento: boolean("outro_atendimento"),
  // Profissional
  profissional: text("profissional"),
  especialidade: text("especialidade"),
  // Resultado
  data: text("data"),
  resultado: text("resultado"),
  respostas: text("respostas"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
