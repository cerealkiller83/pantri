import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "../client/src/lib/offlineQueue";

/**
 * isTransientNetworkError is called from mutation onError handlers to decide
 * whether to enqueue the failed mutation for offline replay or to surface the
 * error and roll back optimistic state. Getting this wrong has UX consequences
 * (silently swallowing real validation errors, or noisily warning users about
 * benign offline blips), so the heuristic is unit-tested across all branches.
 */
describe("isTransientNetworkError", () => {
  it("returns false for nullish input", () => {
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
  });

  it("returns true on TRPC TIMEOUT data code", () => {
    expect(isTransientNetworkError({ data: { code: "TIMEOUT" } })).toBe(true);
  });

  it("returns true for fetch-style failure messages (case-insensitive)", () => {
    expect(isTransientNetworkError({ message: "Failed to fetch" })).toBe(true);
    expect(isTransientNetworkError({ message: "FAILED TO FETCH" })).toBe(true);
    expect(isTransientNetworkError({ message: "NetworkError when attempting to fetch" })).toBe(true);
    expect(isTransientNetworkError({ message: "Load failed" })).toBe(true);
    expect(isTransientNetworkError({ message: "client is offline" })).toBe(true);
  });

  it("returns false for application-level errors", () => {
    expect(isTransientNetworkError({ message: "Item name is required" })).toBe(false);
    expect(isTransientNetworkError({ message: "FORBIDDEN", data: { code: "FORBIDDEN" } })).toBe(false);
    expect(isTransientNetworkError({ message: "NOT_FOUND", data: { code: "NOT_FOUND" } })).toBe(false);
  });

  it("returns true when navigator.onLine is false even with a generic message", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });
    try {
      expect(isTransientNetworkError({ message: "something happened" })).toBe(true);
    } finally {
      if (desc) Object.defineProperty(globalThis, "navigator", desc);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it("returns false when navigator.onLine is true and message is benign", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
    try {
      expect(isTransientNetworkError({ message: "validation failed" })).toBe(false);
    } finally {
      if (desc) Object.defineProperty(globalThis, "navigator", desc);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});
