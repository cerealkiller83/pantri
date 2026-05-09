import { useOfflineQueue } from "@/lib/useOfflineQueue";

/**
 * Invisible mount-at-root component that ensures the offline queue replay
 * listener is always installed regardless of which page the user is viewing.
 * Without this, the `online` event handler only attaches inside AppShell,
 * which means an offline-only navigation (e.g., the Kiosk page) wouldn't
 * trigger replay on reconnect.
 *
 * The hook itself is idempotent and lightweight (no network calls until an
 * `online` event fires).
 */
export function OfflineQueueRunner() {
  useOfflineQueue();
  return null;
}
