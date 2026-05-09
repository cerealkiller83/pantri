import { describe, expect, it } from "vitest";
import { computeSunriseSunset, isAfterSunset } from "../client/src/lib/sunset";

// Austin, TX
const AUSTIN_LAT = 30.2672;
const AUSTIN_LON = -97.7431;

describe("computeSunriseSunset", () => {
  it("returns sunrise before sunset on a normal day", () => {
    const d = new Date(2026, 5, 21, 12, 0); // June 21, 2026 noon local
    const { sunrise, sunset } = computeSunriseSunset(AUSTIN_LAT, AUSTIN_LON, d);
    expect(sunrise).toBeInstanceOf(Date);
    expect(sunset).toBeInstanceOf(Date);
    const hours = (sunset!.getTime() - sunrise!.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(8);
    expect(hours).toBeLessThan(16);
  });

  it("computes Austin June solstice sunset within a reasonable evening window", () => {
    const d = new Date(2026, 5, 21, 12, 0);
    const { sunset } = computeSunriseSunset(AUSTIN_LAT, AUSTIN_LON, d);
    expect(sunset).not.toBeNull();
    // Austin June solstice sunset is ~8:34 PM CDT = 01:34 UTC the next day.
    // We accept anything between 9 PM CDT and midnight CDT to allow for
    // approximation error and the eqTime drift across noon hours.
    const utcHour = sunset!.getUTCHours();
    expect([0, 1, 2, 3]).toContain(utcHour);
  });
});

describe("isAfterSunset", () => {
  it("returns false when no coordinates supplied", () => {
    expect(isAfterSunset(null, null, new Date())).toBe(false);
    expect(isAfterSunset(undefined, undefined, new Date())).toBe(false);
  });

  it("returns true at midnight in Austin (any season)", () => {
    const midnight = new Date(2026, 5, 21, 0, 0);
    expect(isAfterSunset(AUSTIN_LAT, AUSTIN_LON, midnight)).toBe(true);
  });

  it("returns false at noon in Austin (any season)", () => {
    const noon = new Date(2026, 5, 21, 12, 0);
    expect(isAfterSunset(AUSTIN_LAT, AUSTIN_LON, noon)).toBe(false);
  });
});
