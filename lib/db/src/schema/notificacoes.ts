import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const notificacoesRecepcaoTable = pgTable("notificacoes_recepcao", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id"),
  patientName: text("patient_name").notNull(),
  professionalName: text("professional_name").notNull(),
  acao: text("acao").notNull(),
  dataConsulta: text("data_consulta").notNull(),
  horaConsulta: text("hora_consulta").notNull(),
  lido: boolean("lido").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificacaoRecepcao = typeof notificacoesRecepcaoTable.$inferSelect;
