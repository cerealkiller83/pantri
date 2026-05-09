import { describe, expect, it } from "vitest";
import { generateInviteCode, formatTimeSummary } from "./lib/auth";
import { CATEGORIES, TEXAS_STORES, POLLING_INTERVAL_MS, SOFT_DELETE_DAYS } from "../shared/pantri";

describe("invite code generator", () => {
  it("produces a 6-character alphanumeric code", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("produces a reasonably unique distribution", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateInviteCode());
    // With ~36^6 = ~2 billion possibilities and 500 samples, collisions are extraordinarily rare
    expect(seen.size).toBeGreaterThan(490);
  });
});

describe("formatTimeSummary", () => {
  it("formats a date in human-readable hh:mm AM/PM (en-US)", () => {
    // Use a deterministic local date
    const d = new Date(2026, 4, 5, 15, 42); // 3:42 PM local
    const out = formatTimeSummary(d);
    expect(out).toMatch(/3:42/);
    expect(out.toUpperCase()).toMatch(/PM/);
  });
});

describe("Pantri constants integrity", () => {
  it("exposes exactly 8 Texas stores", () => {
    expect(TEXAS_STORES).toHaveLength(8);
    const slugs = TEXAS_STORES.map((s) => s.slug);
    expect(slugs).toContain("heb");
    expect(slugs).toContain("whole_foods");
    expect(slugs).toContain("target");
    expect(slugs).toContain("walmart");
    expect(slugs).toContain("trader_joes");
    expect(slugs).toContain("costco");
    expect(slugs).toContain("sams_club");
    expect(slugs).toContain("central_market");
  });

  it("has unique store slugs", () => {
    const slugs = TEXAS_STORES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique category slugs and includes 'other' as fallback", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("other");
  });

  it("uses a polling interval between 5 and 10 seconds", () => {
    expect(POLLING_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
    expect(POLLING_INTERVAL_MS).toBeLessThanOrEqual(10_000);
  });

  it("uses exactly a 30-day soft delete window", () => {
    expect(SOFT_DELETE_DAYS).toBe(30);
  });
});
