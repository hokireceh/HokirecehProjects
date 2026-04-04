import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, strategiesTable, pendingPaymentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { broadcaster, ENTITY_EXAMPLES } from "../lib/smartBroadcaster";
import { generatePassword, addDays } from "../lib/utils";

const router = Router();

const PLAN_DAYS: Record<string, number> = { "30d": 30, "60d": 60, "90d": 90 };

router.get("/users", async (_req, res) => {
  try {
    const users = await db.query.usersTable.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        telegramId: u.telegramId,
        telegramUsername: u.telegramUsername,
        telegramName: u.telegramName,
        password: u.password,
        plan: u.plan,
        expiresAt: u.expiresAt.toISOString(),
        isActive: u.isActive,
        isExpired: u.expiresAt < new Date(),
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get users" });
  }
});

router.post("/users", async (req, res) => {
  const { telegramId, telegramUsername, telegramName, plan } = req.body as {
    telegramId: string;
    telegramUsername?: string;
    telegramName?: string;
    plan: string;
  };

  if (!telegramId || !plan || !PLAN_DAYS[plan]) {
    return res.status(400).json({ error: "telegramId dan plan wajib diisi (30d/60d/90d)" });
  }

  try {
    const password = generatePassword();
    const expiresAt = addDays(new Date(), PLAN_DAYS[plan]);

    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });

    if (existing) {
      const base = existing.expiresAt > new Date() ? existing.expiresAt : new Date();
      const newExpiry = addDays(base, PLAN_DAYS[plan]);
      await db.update(usersTable)
        .set({ password, plan, expiresAt: newExpiry, isActive: true, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId));
      const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });
      return res.json({ user: updated, message: "User diupdate" });
    }

    await db.insert(usersTable).values({
      telegramId, telegramUsername: telegramUsername ?? null,
      telegramName: telegramName || `User-${telegramId}`, password, plan, expiresAt, isActive: true,
    });

    const created = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });
    res.status(201).json({ user: created, message: "User ditambahkan" });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/users/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { isActive, extendDays, plan, resetPassword } = req.body as {
    isActive?: boolean;
    extendDays?: number;
    plan?: string;
    resetPassword?: boolean;
  };

  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };

    if (isActive !== undefined) updates.isActive = isActive;
    if (plan && PLAN_DAYS[plan]) updates.plan = plan;
    if (resetPassword) updates.password = generatePassword();
    if (extendDays && extendDays > 0) {
      const base = user.expiresAt > new Date() ? user.expiresAt : new Date();
      updates.expiresAt = addDays(base, extendDays);
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  const permanent = req.query.permanent === "true";
  try {
    if (permanent) {
      await db.delete(usersTable).where(eq(usersTable.id, id));
      res.json({ message: "User dihapus permanen" });
    } else {
      await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, id));
      res.json({ message: "User dinonaktifkan" });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/all-strategies", async (_req, res) => {
  try {
    const strategies = await db.query.strategiesTable.findMany({
      orderBy: [desc(strategiesTable.updatedAt)],
    });
    const users = await db.query.usersTable.findMany();
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json({
      strategies: strategies.map((s) => {
        const user = s.userId ? userMap.get(s.userId) : null;
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          exchange: s.exchange,
          marketSymbol: s.marketSymbol,
          isActive: s.isActive,
          isRunning: s.isRunning,
          realizedPnl: parseFloat(s.realizedPnl ?? "0"),
          totalOrders: s.totalOrders,
          successfulOrders: s.successfulOrders,
          updatedAt: s.updatedAt.toISOString(),
          user: user ? {
            id: user.id,
            telegramName: user.telegramName,
            telegramUsername: user.telegramUsername,
            telegramId: user.telegramId,
          } : null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get strategies" });
  }
});

router.get("/payments", async (_req, res) => {
  try {
    const payments = await db.query.pendingPaymentsTable.findMany({
      orderBy: [desc(pendingPaymentsTable.createdAt)],
    });
    res.json({
      payments: payments.map((p) => ({
        id: p.id,
        donationId: p.donationId,
        telegramId: p.telegramId,
        telegramName: p.telegramName,
        telegramUsername: p.telegramUsername,
        plan: p.plan,
        amount: parseFloat(p.amount),
        expiresAt: p.expiresAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get payments" });
  }
});

// ─── BROADCAST: Start ─────────────────────────────────────────────────────────
router.post("/broadcast", async (req, res) => {
  const { message, parseMode, disableWebPagePreview, targetFilter } = req.body as {
    message: string;
    parseMode?: "HTML" | "MarkdownV2" | "Markdown";
    disableWebPagePreview?: boolean;
    targetFilter?: "all" | "active";
  };
  if (!message?.trim()) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  }
  try {
    const job = await broadcaster.enqueue({
      message: message.trim(),
      parseMode: parseMode ?? "HTML",
      disableWebPagePreview: disableWebPagePreview ?? true,
      targetFilter: targetFilter ?? "active",
    });
    res.json({ jobId: job.id, total: job.total, status: job.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memulai broadcast" });
  }
});

// ─── BROADCAST: Status per job ────────────────────────────────────────────────
router.get("/broadcast/status/:jobId", (req, res) => {
  const job = broadcaster.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job tidak ditemukan" });
  res.json(job);
});

// ─── BROADCAST: Latest job status ─────────────────────────────────────────────
router.get("/broadcast/status", (_req, res) => {
  const job = broadcaster.getLatest();
  res.json(job ?? { status: "idle" });
});

// ─── BROADCAST: History (last 20 jobs) ────────────────────────────────────────
router.get("/broadcast/history", (_req, res) => {
  res.json({ jobs: broadcaster.getAll(), stats: broadcaster.getStats() });
});

// ─── BROADCAST: Cancel ────────────────────────────────────────────────────────
router.delete("/broadcast/cancel", (req, res) => {
  const { jobId } = req.body as { jobId?: string };
  const cancelled = broadcaster.cancel(jobId);
  res.json({ cancelled, message: cancelled ? "Broadcast dibatalkan" : "Tidak ada broadcast yang aktif" });
});

// ─── BROADCAST: Entity type reference ─────────────────────────────────────────
router.get("/broadcast/entities", (_req, res) => {
  res.json({ entities: ENTITY_EXAMPLES });
});

export default router;
