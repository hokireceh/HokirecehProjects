import { pgTable, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type DcaConfig = {
  amountPerOrder: number;
  intervalMinutes: number;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "post_only";
  maxOrders?: number;
  limitPriceOffset?: number;
};

export type GridConfig = {
  amountPerGrid: number;
  upperPrice: number;
  lowerPrice: number;
  gridLevels: number;
  mode?: "neutral" | "long" | "short";
  stopLoss?: number | null;
  takeProfit?: number | null;
  orderType?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
};

export const strategiesTable = pgTable("strategies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  marketIndex: integer("market_index").notNull(),
  marketSymbol: text("market_symbol").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  isRunning: boolean("is_running").default(false).notNull(),
  dcaConfig: jsonb("dca_config").$type<DcaConfig>(),
  gridConfig: jsonb("grid_config").$type<GridConfig>(),
  totalOrders: integer("total_orders").default(0).notNull(),
  successfulOrders: integer("successful_orders").default(0).notNull(),
  totalBought: numeric("total_bought", { precision: 20, scale: 8 }).default("0").notNull(),
  totalSold: numeric("total_sold", { precision: 20, scale: 8 }).default("0").notNull(),
  avgBuyPrice: numeric("avg_buy_price", { precision: 20, scale: 8 }).default("0").notNull(),
  avgSellPrice: numeric("avg_sell_price", { precision: 20, scale: 8 }).default("0").notNull(),
  realizedPnl: numeric("realized_pnl", { precision: 20, scale: 8 }).default("0").notNull(),
  exchange: text("exchange").default("lighter").notNull(),
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // ── Auto-Rerange state (persisted to DB so restarts don't lose state) ────────
  // lastRerangeAt: kapan terakhir kali rerange sukses di-approve. Untuk cooldown 2 jam.
  lastRerangeAt: timestamp("last_rerange_at"),
  // rerangeCountToday: jumlah rerange yang sudah di-approve hari ini (maks 3).
  rerangeCountToday: integer("rerange_count_today").default(0).notNull(),
  // rerangeCountDate: tanggal hitungan rerangeCountToday (YYYY-MM-DD). Reset jika beda hari.
  rerangeCountDate: text("rerange_count_date"),
  // pendingRerangeAt: timestamp saat pesan konfirmasi dikirim ke user.
  // Jika ada nilainya = bot sedang menunggu konfirmasi user (short-circuit aktif).
  pendingRerangeAt: timestamp("pending_rerange_at"),
  // pendingRerangeParams: parameter grid baru dari AI, disimpan sampai user approve/reject.
  pendingRerangeParams: jsonb("pending_rerange_params"),
  // consecutiveOutOfRange: counter tick berturut-turut harga di luar range.
  // Trigger auto-rerange setelah nilai ini mencapai 5.
  // Di-reset ke 0 saat harga masuk range ATAU bot di-stop/pause.
  consecutiveOutOfRange: integer("consecutive_out_of_range").default(0).notNull(),
});

export const insertStrategySchema = createInsertSchema(strategiesTable);
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategiesTable.$inferSelect;
