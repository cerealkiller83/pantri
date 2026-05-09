import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "./trpc";
import {
  clearQueue,
  flushQueue,
  isTransientNetworkError,
  listQueued,
  subscribeToQueue,
  enqueue,
  type QueuedKind,
  type QueuedMutation,
} from "./offlineQueue";

/**
 * Hook that exposes the live queue size and offers a manual flush.
 * Also auto-flushes whenever the browser fires `online`.
 */
export function useOfflineQueue() {
  const utils = trpc.useUtils();
  const [size, setSize] = useState(0);
  const [pending, setPending] = useState<QueuedMutation[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const queued = await listQueued().catch(() => []);
      if (cancelled) return;
      setPending(queued);
      setSize(queued.length);
    }
    void refresh();
    const unsub = subscribeToQueue(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    function onOnline() {
      setOnline(true);
      void flush();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    if (flushing) return;
    setFlushing(true);
    try {
      const result = await flushQueue(utils);
      if (result.replayed > 0) {
        toast.success(
          `Synced ${result.replayed} queued change${result.replayed === 1 ? "" : "s"}.`,
        );
        await utils.items.list.invalidate();
        await utils.items.audit.invalidate();
      }
      if (result.dropped > 0) {
        toast.warning(
          `${result.dropped} queued change${result.dropped === 1 ? "" : "s"} were dropped (no longer applicable).`,
        );
      }
    } catch {
      // Outer flush errors are unexpected; the per-entry failures are handled inside flushQueue.
    } finally {
      setFlushing(false);
    }
  }

  async function discardAll() {
    await clearQueue();
    toast.info("Queue cleared.");
  }

  return { size, pending, flushing, online, flush, discardAll };
}

/**
 * Wraps a mutation call so that transient-network failures land in the offline queue
 * instead of bubbling up. The optimistic update should already be applied by the
 * caller (Dashboard uses TanStack Query optimistic updates), so the user sees their
 * change instantly even when offline.
 */
export async function runWithOfflineFallback<T>(
  kind: QueuedKind,
  input: T,
  online: () => Promise<unknown>,
): Promise<{ ok: true; queued: false } | { ok: true; queued: true } | { ok: false; error: Error }> {
  try {
    await online();
    return { ok: true, queued: false };
  } catch (err) {
    if (isTransientNetworkError(err)) {
      await enqueue(kind, input);
      toast.info("Saved offline — will sync when reconnected.");
      return { ok: true, queued: true };
    }
    return { ok: false, error: err as Error };
  }
}
