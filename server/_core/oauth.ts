import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function setSessionAndRedirect(res: Response, req: Request, user: { openId: string; name?: string | null; email?: string | null }, redirectTo: string = "/") {
  const sessionToken = await sdk.createSessionToken(user.openId, {
    name: user.name || user.email || "",
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  const safePath = redirectTo.startsWith("/") ? redirectTo : "/";
  return safePath;
}

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/register — create account with email + password
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const lowerEmail = (email as string).toLowerCase().trim();
    const openId = `email:${lowerEmail}`;

    // Check if user already exists
    const existing = await db.getUserByOpenId(openId);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    await db.createUserWithPassword({
      email: lowerEmail,
      passwordHash,
      name: typeof name === "string" && name.trim() ? name.trim() : lowerEmail.split("@")[0],
    });

    const user = await db.getUserByOpenId(openId);
    if (!user) {
      res.status(500).json({ error: "Failed to create account" });
      return;
    }

    const safePath = await setSessionAndRedirect(res, req, user);
    res.json({ ok: true, redirect: safePath });
  });

  // POST /api/auth/login — sign in with email + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const lowerEmail = (email as string).toLowerCase().trim();
    const openId = `email:${lowerEmail}`;

    const user = await db.getUserByOpenId(openId);
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Update last signed in
    await db.upsertUser({ openId, lastSignedIn: new Date() });

    const safePath = await setSessionAndRedirect(res, req, user);
    res.json({ ok: true, redirect: safePath });
  });

  // Keep magic link verify route for existing links in emails
  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";

    if (!token) {
      res.redirect(302, `/login?error=missing_token`);
      return;
    }

    const tokenRow = await db.findMagicLinkToken(token);
    if (!tokenRow) {
      res.redirect(302, `/login?error=invalid_or_expired`);
      return;
    }

    await db.markMagicLinkUsed(tokenRow.id);
    const user = await db.upsertUserByEmail(tokenRow.email);

    const safePath = await setSessionAndRedirect(res, req, user, returnTo);
    res.redirect(302, safePath);
  });
}
