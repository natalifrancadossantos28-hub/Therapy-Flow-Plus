import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  prontuario: text("prontuario"),
  name: text("name").notNull(),
  dateOfBirth: text("date_of_birth"),
  cpf: text("cpf"),
  cns: text("cns"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  guardianName: text("guardian_name"),
  guardianPhone: text("guardian_phone"),
  motherName: text("mother_name"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  professionalId: integer("professional_id"),
  status: text("status").notNull().default("Aguardando Triagem"),
  entryDate: text("entry_date"),
  absenceCount: integer("absence_count").notNull().default(0),
  triagemScore: integer("triagem_score"),
  scorePsicologia: integer("score_psicologia"),
  scorePsicomotricidade: integer("score_psicomotricidade"),
  scoreFisioterapia: integer("score_fisioterapia"),
  scorePsicopedagogia: integer("score_psicopedagogia"),
  scoreEdFisica: integer("score_ed_fisica"),
  scoreFonoaudiologia: integer("score_fonoaudiologia"),
  scoreTO: integer("score_to"),
  scoreNutricionista: integer("score_nutricionista"),
  escolaPublica: boolean("escola_publica"),
  trabalhoNaRoca: boolean("trabalho_na_roca"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
