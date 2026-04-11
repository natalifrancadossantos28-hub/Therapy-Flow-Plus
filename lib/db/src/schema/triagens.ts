import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const triagens = pgTable("triagens", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  idade: text("idade"),
  responsavel: text("responsavel"),
  profissional: text("profissional"),
  especialidade: text("especialidade"),
  data: text("data"),
  resultado: text("resultado"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
