import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const triagens = pgTable("triagens", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  dataNascimento: text("data_nascimento"),
  idade: text("idade"),
  responsavel: text("responsavel"),
  telefone: text("telefone"),
  endereco: text("endereco"),
  diagnostico: text("diagnostico"),
  cid: text("cid"),
  profissional: text("profissional"),
  especialidade: text("especialidade"),
  data: text("data"),
  resultado: text("resultado"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
