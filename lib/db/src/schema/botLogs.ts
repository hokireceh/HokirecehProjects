import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botLogsTable = pgTable("bot_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id"),
  strategyId: integer("strategy_id"),
  strategyName: text("strategy_name"),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  details: text("details"),
  exchange: text("exchange").default("lighter"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBotLogSchema = createInsertSchema(botLogsTable);
export type InsertBotLog = z.infer<typeof insertBotLogSchema>;
export type BotLog = typeof botLogsTable.$inferSelect;
