import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const waitingListTable = pgTable("waiting_list", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  patientId: integer("patient_id").notNull(),
  professionalId: integer("professional_id"),
  priority: text("priority").notNull().default("media"),
  notes: text("notes"),
  entryDate: text("entry_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWaitingListSchema = createInsertSchema(waitingListTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWaitingList = z.infer<typeof insertWaitingListSchema>;
export type WaitingListEntry = typeof waitingListTable.$inferSelect;
