import { describe, expect, it } from "vitest";
import { isPushConfigured, sendHouseholdPush } from "./lib/pushSend";

/**
 * These tests validate the no-VAPID short-circuit. In CI / dev no VAPID env vars are set,
 * so isPushConfigured() returns false and sendHouseholdPush returns zero counts without
 * attempting to call out to subscriptions. This lets the rest of the app safely fire-and-
 * forget pushes without branching on configuration.
 */
describe("pushSend (no VAPID configured)", () => {
  it("isPushConfigured returns false without VAPID env", () => {
    expect(isPushConfigured()).toBe(false);
  });

  it("sendHouseholdPush returns zero counts and does not throw", async () => {
    const result = await sendHouseholdPush(1, {
      title: "Test",
      body: "Should be a no-op",
      trigger: "itemAdded",
    });
    expect(result).toEqual({ sent: 0, skipped: 0, removed: 0 });
  });
});
