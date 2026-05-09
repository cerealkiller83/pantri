import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { listAllHouseholdIds, listExpiringPantry, recordAudit } from "../db";
import { sendHouseholdPush } from "../lib/pushSend";

/**
 * Scheduled-task endpoints. These are public procedures intentionally — they are
 * meant to be called by an external cron (Railway cron, GitHub Action, or the
 * platform's scheduled task feature) using a shared secret token.
 *
 * All endpoints validate `token` against `ENV.scheduledTaskToken`. If the env
 * is unset, the endpoints throw FORBIDDEN to avoid accidentally enabling
 * unauthenticated writes.
 */
export const scheduledRouter = router({
  /**
   * Scan all households for pantry items expiring in ≤3 days or already expired,
   * and send a push to subscribed devices. Designed to be called once per day.
   */
  scanExpiry: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const expected = (ENV as { scheduledTaskToken?: string }).scheduledTaskToken;
      if (!expected || input.token !== expected) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const householdIds = await listAllHouseholdIds();
      let totalPushSent = 0;
      let totalExpiringSent = 0;
      let totalExpiredSent = 0;
      for (const hid of householdIds) {
        const expiring = await listExpiringPantry(hid, 3);
        for (const it of expiring) {
          if (!it.expiresAt) continue;
          const days = Math.ceil((Number(it.expiresAt) - Date.now()) / 86_400_000);
          const isExpired = days < 0;
          const trigger = isExpired ? "expired" : "expiringSoon";
          const result = await sendHouseholdPush(hid, {
            title: isExpired ? "Past expiry" : "Expiring soon",
            body: isExpired
              ? `${it.name} expired ${-days} day${-days === 1 ? "" : "s"} ago`
              : days === 0
              ? `${it.name} expires today`
              : `${it.name} expires in ${days} day${days === 1 ? "" : "s"}`,
            url: "/",
            trigger,
          });
          totalPushSent += result.sent;
          if (isExpired) totalExpiredSent += result.sent;
          else totalExpiringSent += result.sent;
        }
        if (expiring.length > 0) {
          await recordAudit({
            householdId: hid,
            actorUserId: null,
            actorKind: "kiosk",
            action: "expiry.scan",
            itemId: null,
            summary: `Daily expiry scan: ${expiring.length} item${expiring.length === 1 ? "" : "s"} flagged`,
          });
        }
      }
      return {
        householdsScanned: householdIds.length,
        totalPushSent,
        totalExpiringSent,
        totalExpiredSent,
      };
    }),
});
