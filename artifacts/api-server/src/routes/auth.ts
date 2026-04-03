import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

const COOKIE_NAME = "lb_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function resolvePassword(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const cookie = req.cookies?.[COOKIE_NAME];
  if (typeof cookie === "string" && cookie.trim()) return cookie.trim();
  return null;
}

router.post("/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  const trimmed = password?.trim().toUpperCase() ?? "";
  if (!trimmed) return res.status(400).json({ error: "Password diperlukan" });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && trimmed === adminPassword) {
    res.cookie(COOKIE_NAME, trimmed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return res.json({
      id: 0,
      telegramId: "admin",
      telegramName: "Admin",
      telegramUsername: "admin",
      plan: "lifetime",
      expiresAt: null,
      isAdmin: true,
    });
  }

  try {
    const matchedUser = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.password, trimmed),
        eq(usersTable.isActive, true),
        gt(usersTable.expiresAt, new Date())
      ),
    });

    if (!matchedUser) {
      return res.status(401).json({ error: "Password salah atau langganan sudah habis" });
    }

    res.cookie(COOKIE_NAME, trimmed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return res.json({
      id: matchedUser.id,
      telegramId: matchedUser.telegramId,
      telegramName: matchedUser.telegramName,
      telegramUsername: matchedUser.telegramUsername,
      plan: matchedUser.plan,
      expiresAt: matchedUser.expiresAt.toISOString(),
    });
  } catch {
    return res.status(500).json({ error: "Auth error" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const password = resolvePassword(req);
  if (!password) return res.status(401).json({ error: "Unauthorized" });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && password === adminPassword) {
    return res.json({
      id: 0,
      telegramId: "admin",
      telegramName: "Admin",
      telegramUsername: "admin",
      plan: "lifetime",
      expiresAt: null,
      isAdmin: true,
    });
  }

  try {
    const matchedUser = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.password, password),
        eq(usersTable.isActive, true),
        gt(usersTable.expiresAt, new Date())
      ),
    });

    if (!matchedUser) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Password tidak valid atau langganan sudah habis" });
    }

    return res.json({
      id: matchedUser.id,
      telegramId: matchedUser.telegramId,
      telegramName: matchedUser.telegramName,
      telegramUsername: matchedUser.telegramUsername,
      plan: matchedUser.plan,
      expiresAt: matchedUser.expiresAt.toISOString(),
    });
  } catch {
    return res.status(500).json({ error: "Auth error" });
  }
});

export default router;
