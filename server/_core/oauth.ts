import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { Resend } from "resend";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getResend() {
  if (!ENV.resendApiKey) return null;
  return new Resend(ENV.resendApiKey);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/request-login — send magic link email
  app.post("/api/auth/request-login", async (req: Request, res: Response) => {
    const { email } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const lowerEmail = (email as string).toLowerCase().trim();
    const token = await db.createMagicLinkToken(lowerEmail);
    const returnTo = typeof req.body.returnTo === "string" ? req.body.returnTo : "/";
    const verifyUrl = `${ENV.appUrl}/api/auth/verify?token=${token}&returnTo=${encodeURIComponent(returnTo)}`;

    const resend = getResend();
    if (!resend) {
      // Dev fallback: log the link so you can test without Resend configured
      console.log(`[Auth] Magic link (Resend not configured): ${verifyUrl}`);
      res.json({ ok: true, _devLink: verifyUrl });
      return;
    }

    try {
      await resend.emails.send({
        from: ENV.resendFromEmail,
        to: lowerEmail,
        subject: "Your Pantri login link",
        text: `Sign in to Pantri\n\nClick the link below to sign in. This link expires in 15 minutes and can only be used once.\n\n${verifyUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#C2410C;margin-bottom:8px">Sign in to Pantri</h2>
            <p style="color:#44403c;margin-bottom:24px">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#C2410C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Sign in to Pantri</a>
            <p style="color:#78716c;font-size:13px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error("[Auth] Resend error:", err);
      res.status(500).json({ error: "Failed to send email. Please try again." });
      return;
    }

    res.json({ ok: true });
  });

  // GET /api/auth/verify?token=xxx&returnTo=/ — verify token and create session
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

    // Create or find user by email
    const user = await db.upsertUserByEmail(tokenRow.email);

    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || user.email || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    // Sanitize returnTo — only allow relative paths
    const safePath = returnTo.startsWith("/") ? returnTo : "/";
    res.redirect(302, safePath);
  });
}
