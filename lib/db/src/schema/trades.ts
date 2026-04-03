import { pgTable, text, integer, bigint, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id"),
  strategyId: integer("strategy_id").notNull(),
  strategyName: text("strategy_name").notNull(),
  marketIndex: integer("market_index").notNull(),
  marketSymbol: text("market_symbol").notNull(),
  side: text("side").notNull(),
  size: numeric("size", { precision: 20, scale: 8 }).default("0").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).default("0").notNull(),
  fee: numeric("fee", { precision: 20, scale: 8 }).default("0").notNull(),
  status: text("status").notNull().default("pending"),
  orderHash: text("order_hash"),
  clientOrderIndex: bigint("client_order_index", { mode: "number" }),
  exchange: text("exchange").default("lighter").notNull(),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTradeSchema = createInsertSchema(tradesTable);
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
