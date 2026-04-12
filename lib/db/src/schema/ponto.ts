import { pgTable, text, serial, timestamp, boolean, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pontoCompaniesTable = pgTable("ponto_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  adminPassword: text("admin_password").notNull().default("admin123"),
  toleranceMinutes: integer("tolerance_minutes").notNull().default(10),
  overtimeBlockEnabled: boolean("overtime_block_enabled").notNull().default(true),
  defaultBreakMinutes: integer("default_break_minutes").notNull().default(60),
  active: boolean("active").notNull().default(true),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pontoEmployeesTable = pgTable("ponto_employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  cpf: text("cpf").notNull(),
  role: text("role").notNull(),
  photo: text("photo"),
  weeklyHours: integer("weekly_hours").notNull().default(44),
  active: boolean("active").notNull().default(true),
  entryTime: text("entry_time"),
  exitTime: text("exit_time"),
  breakMinutes: integer("break_minutes").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pontoRecordsTable = pgTable("ponto_records", {
  id: serial("id").primaryKey(),
  employeeId: serial("employee_id").references(() => pontoEmployeesTable.id).notNull(),
  type: text("type").notNull(),
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull().defaultNow(),
  date: date("date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPontoCompanySchema = createInsertSchema(pontoCompaniesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPontoCompany = z.infer<typeof insertPontoCompanySchema>;
export type PontoCompany = typeof pontoCompaniesTable.$inferSelect;

export const insertPontoEmployeeSchema = createInsertSchema(pontoEmployeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPontoEmployee = z.infer<typeof insertPontoEmployeeSchema>;
export type PontoEmployee = typeof pontoEmployeesTable.$inferSelect;

export const insertPontoRecordSchema = createInsertSchema(pontoRecordsTable).omit({ id: true, createdAt: true, punchedAt: true });
export type InsertPontoRecord = z.infer<typeof insertPontoRecordSchema>;
export type PontoRecord = typeof pontoRecordsTable.$inferSelect;
