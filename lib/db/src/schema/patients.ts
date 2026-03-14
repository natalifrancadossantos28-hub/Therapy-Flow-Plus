import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  dateOfBirth: text("date_of_birth"),
  cpf: text("cpf"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  guardianName: text("guardian_name"),
  guardianPhone: text("guardian_phone"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  professionalId: integer("professional_id"),
  status: text("status").notNull().default("ativo"),
  absenceCount: integer("absence_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
