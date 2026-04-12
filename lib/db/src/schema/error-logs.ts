import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nfsErrorLogsTable = pgTable("nfs_error_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  app: text("app").notNull(),          // "ponto" | "triagem" | "arco-iris"
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  url: text("url"),
  userAgent: text("user_agent"),
  context: text("context"),            // JSON string with extra context
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNfsErrorLogSchema = createInsertSchema(nfsErrorLogsTable).omit({ id: true, createdAt: true });
export type InsertNfsErrorLog = z.infer<typeof insertNfsErrorLogSchema>;
export type NfsErrorLog = typeof nfsErrorLogsTable.$inferSelect;
