import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const COOKIE_NAME = "lb_session";

export interface AuthRequest extends Request {
  userId?: number;
  userTelegramId?: string;
}

function resolvePassword(req: AuthRequest): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const cookie = (req as any).cookies?.[COOKIE_NAME];
  if (typeof cookie === "string" && cookie.trim()) return cookie.trim();
  return null;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const password = resolvePassword(req);
  if (!password) return res.status(401).json({ error: "Unauthorized" });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && password === adminPassword) {
    req.userId = 0;
    req.userTelegramId = "admin";
    return next();
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
      return res.status(401).json({ error: "Password tidak valid atau langganan sudah habis" });
    }

    req.userId = matchedUser.id;
    req.userTelegramId = matchedUser.telegramId;
    next();
  } catch (err) {
    return res.status(500).json({ error: "Auth error" });
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.status(503).json({ error: "Admin not configured" });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7).trim() !== adminPassword) {
    return res.status(401).json({ error: "Admin access required" });
  }
  next();
}
