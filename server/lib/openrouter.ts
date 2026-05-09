import { ENV } from "../_core/env";
import { TEXAS_STORES, CATEGORIES } from "../../shared/pantri";

export type ReceiptLine = {
  /** Raw text as printed on the receipt (e.g., "ORG WHL MILK 1G") */
  rawText: string;
  /** Cleaned/normalized name (e.g., "Organic whole milk 1 gal") */
  name: string;
  /** Best-guess Pantri category slug; "other" if uncertain */
  category: string;
  /** Whether the LLM thinks this line is a food / pantry item suitable for tracking */
  isFood: boolean;
  /** Quantity (1 if not visible) */
  quantity: number;
  /** Unit price in cents (the per-unit, not subtotal). Null if unknown. */
  priceCents: number | null;
  /** Subtotal in cents (qty * unit price). Null if unknown. */
  subtotalCents: number | null;
};

export type ReceiptParseResult = {
  /** Detected store slug from TEXAS_STORES, or null if not one of the 8 supported */
  storeSlug: string | null;
  /** Free-text store name as printed (for display) */
  storeName: string | null;
  /** Receipt date as ISO string if found, or null */
  receiptDate: string | null;
  /** Total in cents (after tax) if visible, or null */
  totalCents: number | null;
  /** Extracted line items */
  lines: ReceiptLine[];
};

const STORE_LIST_PROMPT = TEXAS_STORES.map((s) => `${s.slug} (${s.name})`).join(", ");
const CATEGORY_LIST_PROMPT = CATEGORIES.map((c) => `${c.slug} (${c.name})`).join(", ");

const SYSTEM_PROMPT = `You are a receipt OCR specialist for a household grocery app called Pantri.
You receive a photo of a US grocery store paper receipt and extract structured data.

Rules:
- Identify the store. The 8 supported stores are: ${STORE_LIST_PROMPT}. If it's one of these, return its slug exactly. Otherwise return null.
- Extract every visible line item that is a product (skip sub-totals, tax, savings, coupons, fees, ENTER PIN messages, footers).
- For each item: produce a clean human-readable name (Title Case, expand obvious abbreviations like ORG -> Organic, WHL -> Whole, MLK -> Milk, BNS -> Bananas).
- Decide if the item is food/pantry (isFood: true) — this includes produce, dairy, meat, seafood, bakery, pantry staples, frozen food, beverages, snacks. Set isFood: false for cleaning supplies, paper products, electronics, clothing, pharmacy.
- Pick the closest category from: ${CATEGORY_LIST_PROMPT}. If unsure, use "other".
- Prices are in cents. A price of "$3.49" = 349 cents. Never use decimals.
- Quantity defaults to 1 unless the receipt clearly shows a multiplier (e.g., "2 @ $1.49").
- If a price is unreadable, return null for that field rather than guessing.

Return STRICT JSON matching this shape:
{
  "storeSlug": "heb" | "whole_foods" | "target" | "walmart" | "trader_joes" | "costco" | "sams_club" | "central_market" | null,
  "storeName": "string or null",
  "receiptDate": "ISO 8601 date string or null",
  "totalCents": number | null,
  "lines": [
    {
      "rawText": "string",
      "name": "string",
      "category": "produce" | "dairy" | ... | "other",
      "isFood": boolean,
      "quantity": number,
      "priceCents": number | null,
      "subtotalCents": number | null
    }
  ]
}`;

/**
 * Calls OpenRouter with a multimodal prompt to parse a receipt photo.
 * Throws a recognizable error if the API key is not configured so the UI can
 * surface a helpful message.
 */
export async function parseReceiptViaOpenRouter(
  imageDataUrl: string,
  modelOverride?: string
): Promise<ReceiptParseResult> {
  if (!ENV.openrouterKey) {
    const err = new Error("OpenRouter API key not configured. Set OPENROUTER_API_KEY in your project secrets.");
    (err as Error & { code: string }).code = "OPENROUTER_NOT_CONFIGURED";
    throw err;
  }

  // Default to OpenRouter's free auto-router. The `:free` variant of
  // `openrouter/auto` (alias `openrouter/free`) routes to whichever
  // multimodal model is currently free for vision/JSON tasks. This keeps
  // receipt OCR at $0/month. Callers can override with a specific model
  // (e.g. `google/gemini-2.5-flash`) for higher accuracy on tricky receipts.
  const model = modelOverride ?? "openrouter/auto:free";

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pantri.bydna.co",
      "X-Title": "Pantri",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract this receipt as JSON per the schema." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`OpenRouter request failed (${resp.status}): ${detail}`);
  }

  const json = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models wrap JSON in markdown fences; strip them defensively.
    const stripped = raw.replace(/```(?:json)?/g, "").trim();
    parsed = JSON.parse(stripped);
  }

  return normalizeReceipt(parsed);
}

function normalizeReceipt(input: unknown): ReceiptParseResult {
  const obj = (input ?? {}) as Record<string, unknown>;
  const validSlugs: Set<string> = new Set(TEXAS_STORES.map((s) => s.slug));
  const validCats: Set<string> = new Set(CATEGORIES.map((c) => c.slug));

  const storeSlug = typeof obj.storeSlug === "string" && validSlugs.has(obj.storeSlug)
    ? obj.storeSlug
    : null;
  const storeName = typeof obj.storeName === "string" ? obj.storeName : null;
  const receiptDate = typeof obj.receiptDate === "string" ? obj.receiptDate : null;
  const totalCents = typeof obj.totalCents === "number" ? Math.round(obj.totalCents) : null;
  const linesRaw = Array.isArray(obj.lines) ? obj.lines : [];

  const lines: ReceiptLine[] = linesRaw.map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    const cat = typeof line.category === "string" && validCats.has(line.category)
      ? line.category
      : "other";
    return {
      rawText: String(line.rawText ?? line.name ?? "").slice(0, 200),
      name: String(line.name ?? line.rawText ?? "").slice(0, 200),
      category: cat,
      isFood: Boolean(line.isFood),
      quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
      priceCents: typeof line.priceCents === "number" ? Math.round(line.priceCents) : null,
      subtotalCents: typeof line.subtotalCents === "number" ? Math.round(line.subtotalCents) : null,
    };
  }).filter((l) => l.name.length > 0);

  return { storeSlug, storeName, receiptDate, totalCents, lines };
}

/**
 * Simple Levenshtein-based fuzzy match between a receipt line name and existing item names.
 * Returns the best match if its similarity is above `threshold` (0..1), else null.
 */
export function fuzzyMatchItem<T extends { id: number; name: string }>(
  lineName: string,
  candidates: T[],
  threshold = 0.62
): T | null {
  if (!lineName || candidates.length === 0) return null;
  const a = normalize(lineName);
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(a, normalize(c.name));
    if (!best || score > best.score) best = { item: c, score };
  }
  return best && best.score >= threshold ? best.item : null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = cur;
    }
  }
  return dp[n];
}
