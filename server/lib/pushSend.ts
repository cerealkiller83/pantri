import webpush from "web-push";
import { ENV } from "../_core/env";
import { deletePushSubscription, listPushSubscriptionsForHousehold } from "../db";

let configured = false;

function configure() {
  if (configured) return true;
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) return false;
  webpush.setVapidDetails(
    ENV.vapidSubject ?? "mailto:owner@pantri.local",
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
  configured = true;
  return true;
}

export type PushTrigger = "itemAdded" | "itemChecked" | "expiringSoon" | "expired";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Used to opt out per-subscription based on saved prefs. */
  trigger: PushTrigger;
}

/**
 * Send a notification to every device subscribed for a household,
 * filtered by per-subscription preferences. Silently no-ops when VAPID is unconfigured
 * so callers don't need to branch.
 *
 * Returns counts {sent, skipped, removed} for observability.
 */
export async function sendHouseholdPush(
  householdId: number,
  payload: PushPayload,
  options: { excludeUserId?: number } = {}
): Promise<{ sent: number; skipped: number; removed: number }> {
  if (!configure()) return { sent: 0, skipped: 0, removed: 0 };

  const subs = await listPushSubscriptionsForHousehold(householdId);
  let sent = 0;
  let skipped = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      if (options.excludeUserId && s.userId === options.excludeUserId) {
        skipped++;
        return;
      }
      const prefs = (s.prefs as Record<string, boolean> | null) ?? null;
      if (prefs && prefs[payload.trigger] === false) {
        skipped++;
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.authKey },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? "/",
          })
        );
        sent++;
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 404 || e.statusCode === 410) {
          // Subscription gone; clean up.
          await deletePushSubscription(s.endpoint).catch(() => {});
          removed++;
        } else {
          skipped++;
          console.warn("[push] send failed", e);
        }
      }
    })
  );

  return { sent, skipped, removed };
}

export function isPushConfigured() {
  return configure();
}
