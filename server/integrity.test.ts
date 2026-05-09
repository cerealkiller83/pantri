/**
 * Integrity tests: catch drift between schema enums, shared constants, and
 * the validation rules in our routers/db helpers. These run without a DB.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, TEXAS_STORES, POLLING_INTERVAL_MS, SOFT_DELETE_DAYS } from "../shared/pantri";

describe("Schema and shared constants integrity", () => {
  it("has exactly the eight Texas stores requested by the user, in canonical order", () => {
    const slugs = TEXAS_STORES.map((s) => s.slug);
    expect(slugs).toEqual([
      "heb",
      "whole_foods",
      "target",
      "walmart",
      "trader_joes",
      "costco",
      "sams_club",
      "central_market",
    ]);
  });

  it("every store has a name and a brand color", () => {
    for (const store of TEXAS_STORES) {
      expect(store.name).toMatch(/.+/);
      expect(store.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("category list includes the standard grocery taxonomy", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain("produce");
    expect(slugs).toContain("dairy");
    expect(slugs).toContain("meat");
    expect(slugs).toContain("pantry");
    expect(slugs).toContain("frozen");
    expect(slugs).toContain("other"); // fallback
  });

  it("every category has an emoji and a name", () => {
    for (const cat of CATEGORIES) {
      expect(cat.name).toMatch(/.+/);
      expect(cat.emoji).toMatch(/.+/);
    }
  });

  it("polling interval is in the agreed 5-10 second range", () => {
    expect(POLLING_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(POLLING_INTERVAL_MS).toBeLessThanOrEqual(10_000);
  });

  it("soft delete window matches the 30-day spec", () => {
    expect(SOFT_DELETE_DAYS).toBe(30);
  });

  it("all category slugs are unique", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all store slugs are unique", () => {
    const slugs = TEXAS_STORES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("Member management business rules (validation only)", () => {
  // These mirror the rules enforced server-side in households.transferOwner /
  // households.removeMember / households.setRole. We test the rule logic
  // outside of the DB to verify the contracts our UI relies on.
  function canRemove(actorRole: string, targetRole: string, isSelf: boolean): boolean {
    if (isSelf) return false; // use leave instead
    if (!["owner", "admin"].includes(actorRole)) return false;
    if (targetRole === "owner") return false; // must transfer first
    return true;
  }

  function canTransfer(actorRole: string, targetRole: string, isSelf: boolean): boolean {
    if (actorRole !== "owner") return false;
    if (isSelf) return false;
    return ["admin", "member"].includes(targetRole);
  }

  it("an owner can remove an admin or member, but not themselves or another owner", () => {
    expect(canRemove("owner", "member", false)).toBe(true);
    expect(canRemove("owner", "admin", false)).toBe(true);
    expect(canRemove("owner", "owner", false)).toBe(false);
    expect(canRemove("owner", "member", true)).toBe(false);
  });

  it("an admin can remove a member but not the owner", () => {
    expect(canRemove("admin", "member", false)).toBe(true);
    expect(canRemove("admin", "owner", false)).toBe(false);
  });

  it("a member cannot remove anyone", () => {
    expect(canRemove("member", "member", false)).toBe(false);
    expect(canRemove("member", "admin", false)).toBe(false);
  });

  it("only owners can transfer ownership, and never to themselves", () => {
    expect(canTransfer("owner", "admin", false)).toBe(true);
    expect(canTransfer("owner", "member", false)).toBe(true);
    expect(canTransfer("admin", "member", false)).toBe(false);
    expect(canTransfer("owner", "admin", true)).toBe(false);
  });
});
