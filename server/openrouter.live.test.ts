import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

/**
 * Live OpenRouter credential check.
 *
 * This test makes a real lightweight network call to
 *   GET https://openrouter.ai/api/v1/models
 * with the configured `OPENROUTER_API_KEY` as a Bearer token. We are NOT
 * exercising receipt OCR here (which would burn a real OCR call); we are only
 * verifying the credential authenticates against the OpenRouter control plane.
 *
 * If `OPENROUTER_API_KEY` is unset (e.g. CI without secrets), the test is
 * skipped rather than failing — this lets the same suite run cleanly both in
 * the user's sandbox (with the key set) and in the upstream test runner.
 */
describe("openrouter live credential", () => {
  const hasKey = Boolean(ENV.openrouterKey);

  it.skipIf(!hasKey)(
    "authenticates against /api/v1/auth/key (auth-sensitive endpoint)",
    async () => {
      // /api/v1/auth/key REQUIRES a valid Bearer token. With no/invalid key it
      // returns 401, so a 200 here proves the configured key is genuinely
      // accepted by OpenRouter — unlike /models, which can return 200 without
      // auth on some tiers.
      const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ENV.openrouterKey}`,
          "HTTP-Referer": "https://pantri.bydna.co",
          "X-Title": "Pantri",
        },
      });

      // Read body once — fetch streams are one-shot.
      const json = (await resp.json().catch(() => ({}))) as {
        data?: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean };
      };

      expect(resp.status, JSON.stringify(json).slice(0, 400)).toBe(200);
      // The /auth/key payload describes the bound key; presence of `data`
      // with at least one of these fields proves we authenticated.
      expect(json.data).toBeDefined();
      expect(
        typeof json.data?.label === "string" ||
          typeof json.data?.usage === "number" ||
          typeof json.data?.is_free_tier === "boolean"
      ).toBe(true);
    },
    20_000
  );

  it.skipIf(!hasKey)(
    "lists at least one free auto-router model entry (sanity check for openrouter/auto:free default)",
    async () => {
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ENV.openrouterKey}`,
          "HTTP-Referer": "https://pantri.bydna.co",
          "X-Title": "Pantri",
        },
      });
      expect(resp.status).toBe(200);
      const json = (await resp.json()) as { data?: { id?: string }[] };
      const ids = (json.data ?? []).map((m) => (m.id ?? "").toLowerCase());
      // We don't hard-pin to "openrouter/auto:free" since OpenRouter has
      // historically renamed the alias; instead we assert that *some* free
      // multimodal model exists in the catalog so our default has somewhere
      // to route to. The convention is `:free` suffix on free tiers.
      const anyFree = ids.some((id) => id.includes(":free"));
      expect(anyFree).toBe(true);
    },
    20_000
  );
});
