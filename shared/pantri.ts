/**
 * Shared constants used by both client and server.
 * Centralizing here keeps the Texas retailer list and category labels in sync.
 */

export const TEXAS_STORES = [
  { slug: "heb", name: "H-E-B", color: "#E2231A" },
  { slug: "whole_foods", name: "Whole Foods", color: "#00674B" },
  { slug: "target", name: "Target", color: "#CC0000" },
  { slug: "walmart", name: "Walmart", color: "#0071CE" },
  { slug: "trader_joes", name: "Trader Joe's", color: "#B81C22" },
  { slug: "costco", name: "Costco", color: "#005DAA" },
  { slug: "sams_club", name: "Sam's Club", color: "#0067A0" },
  { slug: "central_market", name: "Central Market", color: "#3F6B2C" },
] as const;

export type TexasStoreSlug = (typeof TEXAS_STORES)[number]["slug"];

export const STORE_BY_SLUG: Record<string, (typeof TEXAS_STORES)[number]> = Object.fromEntries(
  TEXAS_STORES.map((s) => [s.slug, s])
);

export const CATEGORIES = [
  { slug: "produce", name: "Produce", emoji: "🥬" },
  { slug: "dairy", name: "Dairy", emoji: "🥛" },
  { slug: "meat", name: "Meat", emoji: "🥩" },
  { slug: "seafood", name: "Seafood", emoji: "🐟" },
  { slug: "bakery", name: "Bakery", emoji: "🥖" },
  { slug: "pantry", name: "Pantry", emoji: "🥫" },
  { slug: "frozen", name: "Frozen", emoji: "🧊" },
  { slug: "beverages", name: "Beverages", emoji: "🥤" },
  { slug: "snacks", name: "Snacks", emoji: "🍫" },
  { slug: "household", name: "Household", emoji: "🧴" },
  { slug: "personal_care", name: "Personal Care", emoji: "🧼" },
  { slug: "baby", name: "Baby", emoji: "👶" },
  { slug: "pet", name: "Pet", emoji: "🐾" },
  { slug: "other", name: "Other", emoji: "📦" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const CATEGORY_BY_SLUG: Record<string, (typeof CATEGORIES)[number]> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c])
);

/** How often the client polls active views for changes (ms). */
export const POLLING_INTERVAL_MS = 7000;

/** Soft delete retention window (days). */
export const SOFT_DELETE_DAYS = 30;
