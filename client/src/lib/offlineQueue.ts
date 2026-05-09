/**
 * Offline mutation queue backed by IndexedDB.
 *
 * Intercepts mutations that fail with a network error, persists them in IDB,
 * and replays them in order when the browser comes back online.
 *
 * Scope (v1):
 *  - items.create
 *  - items.setChecked
 *  - items.adjustQuantity
 *  - items.softDelete
 *  - items.restore
 *
 * Conflict resolution: last-writer-wins server-side (the simplest correct choice).
 * If a queued mutation references an item that was hard-deleted by someone else
 * while offline, the server returns FORBIDDEN/NOT_FOUND and we drop that entry
 * with a toast notification.
 *
 * Out of scope: mutations that return data the UI immediately needs back
 * (e.g., uploadPhoto returns a key; receipt parse returns line items). Those
 * stay online-only.
 */

import { trpc } from "./trpc";

const DB_NAME = "pantri-offline";
const DB_VERSION = 1;
const STORE = "mutations";

export type QueuedKind =
  | "items.create"
  | "items.setChecked"
  | "items.adjustQuantity"
  | "items.softDelete"
  | "items.restore";

export type QueuedMutation = {
  id: string;
  kind: QueuedKind;
  // Stored as untyped JSON because tRPC input types vary per procedure.
  // Trade-off: we lose compile-time safety on the input shape inside the queue
  // module, but the producers (mutation hooks) use typed builders below.
  input: unknown;
  createdAt: number;
  attemptCount: number;
  lastError?: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueue(kind: QueuedKind, input: unknown): Promise<QueuedMutation> {
  const db = await openDb();
  const entry: QueuedMutation = {
    id: uuid(),
    kind,
    input,
    createdAt: Date.now(),
    attemptCount: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChange();
  return entry;
}

export async function listQueued(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("createdAt").getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChange();
}

async function bumpAttempt(id: string, error: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const entry = req.result as QueuedMutation | undefined;
      if (!entry) {
        resolve();
        return;
      }
      entry.attemptCount += 1;
      entry.lastError = error;
      store.put(entry);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChange();
}

/** Subscribers (e.g., a queue badge) get notified when the queue changes. */
const listeners = new Set<() => void>();
export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notifyChange(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // Subscriber errors must not break the queue.
    }
  });
}

/**
 * Returns true when the failure looks transient (offline / fetch failure).
 * tRPC HTTP errors (404, 403, 400) are NOT retryable — they indicate the
 * mutation is genuinely invalid and should be dropped from the queue.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; data?: { code?: string }; cause?: unknown };
  if (e.data?.code === "TIMEOUT") return true;
  const msg = (e.message ?? "").toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("offline") ||
    msg.includes("load failed")
  ) {
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

/**
 * Replays all queued mutations in createdAt order.
 * Stops early on the first transient error (we'll resume on the next online event).
 * On non-transient errors, drops the entry and continues.
 *
 * Caller must pass a tRPC utils handle so we can invoke procedures by name.
 * Returns counts for UI feedback.
 */
export async function flushQueue(
  utils: ReturnType<typeof trpc.useUtils>,
): Promise<{ replayed: number; dropped: number; remaining: number }> {
  let replayed = 0;
  let dropped = 0;
  const queued = await listQueued();
  for (const entry of queued) {
    try {
      await replayOne(utils, entry);
      await removeQueued(entry.id);
      replayed += 1;
    } catch (err) {
      if (isTransientNetworkError(err)) {
        // Stop the loop; will retry next online event.
        await bumpAttempt(entry.id, (err as Error).message ?? "transient");
        const remaining = (await listQueued()).length;
        return { replayed, dropped, remaining };
      }
      // Permanent failure (e.g., item was hard-deleted by another user, or
      // server validation rejected the input). Drop with a record.
      await removeQueued(entry.id);
      dropped += 1;
    }
  }
  const remaining = (await listQueued()).length;
  return { replayed, dropped, remaining };
}

async function replayOne(
  utils: ReturnType<typeof trpc.useUtils>,
  entry: QueuedMutation,
): Promise<void> {
  switch (entry.kind) {
    case "items.create":
      await utils.client.items.create.mutate(entry.input as never);
      return;
    case "items.setChecked":
      await utils.client.items.setChecked.mutate(entry.input as never);
      return;
    case "items.adjustQuantity":
      await utils.client.items.adjustQuantity.mutate(entry.input as never);
      return;
    case "items.softDelete":
      await utils.client.items.softDelete.mutate(entry.input as never);
      return;
    case "items.restore":
      await utils.client.items.restore.mutate(entry.input as never);
      return;
    default:
      // Unknown kind — should never happen, but treat as permanent so we drop it.
      throw new Error(`Unknown queued kind: ${entry.kind as string}`);
  }
}

/** Clear the entire queue. Used by a manual "discard pending" action. */
export async function clearQueue(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChange();
}
