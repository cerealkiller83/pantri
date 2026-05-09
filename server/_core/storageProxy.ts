import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  // Legacy /manus-storage/* path — redirect to R2 public URL so any old links still work.
  app.get("/manus-storage/*", (req, res) => {
    const key = (req.params as unknown as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.r2PublicUrl) {
      res.status(500).send("R2_PUBLIC_URL is not configured");
      return;
    }
    const target = `${ENV.r2PublicUrl.replace(/\/+$/, "")}/${key}`;
    res.redirect(307, target);
  });
}
