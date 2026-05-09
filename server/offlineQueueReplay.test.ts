/**
 * Verifies the IndexedDB-backed offline queue persists mutations and replays
 * them in the right order on flushQueue. Covers the three fundamental promises
 * the queue makes to its callers:
 *
 *   1. enqueue persists in createdAt order; listQueued returns them in order
 *   2. flushQueue replays all entries when the network is healthy and clears the queue
 *   3. flushQueue stops at the first transient error (so future-online retry can resume)
 *      and drops entries with permanent server errors (so the queue can't get stuck)
 *
 * Uses fake-indexeddb to provide a real IDB implementation in node, instead of
 * mocking the whole queue module. This catches schema, transaction, and key-path
 * bugs that a pure-mock test would miss.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  enqueue,
  listQueued,
  flushQueue,
  clearQueue,
} from "../client/src/lib/offlineQueue";

type Counts = { replayed: number; dropped: number; remaining: number };

/**
 * Build a fake `utils` object that mimics the shape flushQueue calls into:
 *   utils.client.items.<procedure>.mutate(input)
 *
 * Each procedure pushes its call into a shared log so tests can assert on
 * order and content. Errors are configurable per procedure to simulate
 * transient (network) vs permanent (validation) failures.
 */
function buildFakeUtils(opts?: {
  failures?: Partial<Record<string, "transient" | "permanent">>;
}) {
  const calls: { name: string; input: unknown }[] = [];
  function makeProc(name: string) {
    return {
      mutate: async (input: unknown) => {
        calls.push({ name, input });
        const failure = opts?.failures?.[name];
        if (failure === "transient") {
          // Mimic fetch-style failure that isTransientNetworkError detects.
          throw new Error("Failed to fetch");
        }
        if (failure === "permanent") {
          // Mimic a TRPC validation error.
          const err = new Error("BAD_REQUEST: name is required");
          (err as { data?: { code: string } }).data = { code: "BAD_REQUEST" };
          throw err;
        }
        return { ok: true };
      },
    };
  }
  return {
    utils: {
      client: {
        items: {
          create: makeProc("items.create"),
          setChecked: makeProc("items.setChecked"),
          adjustQuantity: makeProc("items.adjustQuantity"),
          softDelete: makeProc("items.softDelete"),
          restore: makeProc("items.restore"),
        },
      },
    },
    calls,
  };
}

beforeEach(async () => {
  await clearQueue().catch(() => {});
});

afterEach(async () => {
  await clearQueue().catch(() => {});
});

describe("offline queue replay", () => {
  it("persists enqueued mutations and lists them in createdAt order", async () => {
    await enqueue("items.create", { householdId: 1, name: "Eggs", kind: "shopping" });
    // Strict delays so each entry has a strictly-later createdAt; without them,
    // multiple entries can share a millisecond and the IDB index returns them
    // in unpredictable order.
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.setChecked", { itemId: 42, checked: true });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.adjustQuantity", { itemId: 42, delta: -1 });

    const queued = await listQueued();
    expect(queued).toHaveLength(3);
    expect(queued.map((q) => q.kind)).toEqual([
      "items.create",
      "items.setChecked",
      "items.adjustQuantity",
    ]);
    // Each entry has a stable id, kind, input, and createdAt; attempt count starts at 0.
    expect(queued[0].attemptCount).toBe(0);
    expect(queued[0].input).toMatchObject({ name: "Eggs" });
  });

  it("replays all queued mutations in order and clears the queue on success", async () => {
    await enqueue("items.create", { name: "Bread" });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.setChecked", { itemId: 7, checked: true });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.softDelete", { itemId: 7 });

    const { utils, calls } = buildFakeUtils();
    const result = (await flushQueue(utils as never)) as Counts;

    expect(result).toEqual({ replayed: 3, dropped: 0, remaining: 0 });
    expect(calls.map((c) => c.name)).toEqual([
      "items.create",
      "items.setChecked",
      "items.softDelete",
    ]);
    expect(await listQueued()).toHaveLength(0);
  });

  it("stops early on transient error so the entry can be retried on next online event", async () => {
    await enqueue("items.create", { name: "Apples" });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.create", { name: "Oranges" });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.setChecked", { itemId: 99, checked: true });

    // First mutation fails transiently; the loop must stop and preserve all 3.
    const { utils, calls } = buildFakeUtils({
      failures: { "items.create": "transient" },
    });
    const result = (await flushQueue(utils as never)) as Counts;

    expect(result.replayed).toBe(0);
    expect(result.dropped).toBe(0);
    expect(result.remaining).toBe(3);
    // Only the first entry was attempted before the loop bailed.
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("items.create");
    // Attempt count was bumped on the failing entry.
    const queued = await listQueued();
    expect(queued[0].attemptCount).toBe(1);
    expect(queued[0].lastError).toMatch(/fetch/i);
  });

  it("drops entries with permanent errors and continues replaying the rest", async () => {
    await enqueue("items.setChecked", { itemId: 1, checked: true });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.create", { name: "Bad input" });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.adjustQuantity", { itemId: 5, delta: 1 });

    // Only items.create is rejected with a non-retryable error; the queue
    // should drop it and continue with the rest.
    const { utils, calls } = buildFakeUtils({
      failures: { "items.create": "permanent" },
    });
    const result = (await flushQueue(utils as never)) as Counts;

    expect(result.replayed).toBe(2);
    expect(result.dropped).toBe(1);
    expect(result.remaining).toBe(0);
    expect(calls.map((c) => c.name)).toEqual([
      "items.setChecked",
      "items.create",
      "items.adjustQuantity",
    ]);
    expect(await listQueued()).toHaveLength(0);
  });

  it("supports all five queued kinds (regression guard for replayOne switch)", async () => {
    await enqueue("items.create", { name: "x" });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.setChecked", { itemId: 1, checked: true });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.adjustQuantity", { itemId: 1, delta: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.softDelete", { itemId: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue("items.restore", { itemId: 1 });

    const { utils, calls } = buildFakeUtils();
    const result = (await flushQueue(utils as never)) as Counts;

    expect(result.replayed).toBe(5);
    expect(calls.map((c) => c.name)).toEqual([
      "items.create",
      "items.setChecked",
      "items.adjustQuantity",
      "items.softDelete",
      "items.restore",
    ]);
  });
});
