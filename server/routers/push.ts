import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "../../drizzle/schema";
import { deletePushSubscription, getDb, upsertPushSubscription } from "../db";
import { requireHouseholdMember } from "../lib/auth";
import { ENV } from "../_core/env";

const PrefsSchema = z.object({
  itemAdded: z.boolean().default(true),
  itemChecked: z.boolean().default(true),
  expiringSoon: z.boolean().default(true),
  expired: z.boolean().default(true),
});

export const pushRouter = router({
  /**
   * Returns whether the server is configured to send web push.
   * Until VAPID keys are set, the client should still allow saving the subscription
   * so it can be activated later, but should explain the state.
   */
  status: protectedProcedure.query(() => {
    return {
      vapidConfigured: Boolean(ENV.vapidPublicKey && ENV.vapidPrivateKey),
      vapidPublicKey: ENV.vapidPublicKey ?? null,
    };
  }),

  /** Save the browser's PushSubscription on the server. */
  subscribe: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        authKey: z.string().min(1),
        deviceLabel: z.string().max(80).optional(),
        prefs: PrefsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const prefs = input.prefs ?? {
        itemAdded: true,
        itemChecked: true,
        expiringSoon: true,
        expired: true,
      };
      await upsertPushSubscription({
        userId: ctx.user.id,
        householdId: input.householdId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        authKey: input.authKey,
        deviceLabel: input.deviceLabel ?? null,
        prefs,
      });
      return { success: true };
    }),

  /** Remove a push subscription by endpoint (e.g., on permission revoke). */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input }) => {
      await deletePushSubscription(input.endpoint);
      return { success: true };
    }),

  /** List the current user's subscriptions for a given household (one row per device). */
  listMine: protectedProcedure
    .input(z.object({ householdId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, ctx.user.id),
            eq(pushSubscriptions.householdId, input.householdId),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        endpoint: r.endpoint,
        deviceLabel: r.deviceLabel,
        prefs: r.prefs,
        createdAt: r.createdAt,
      }));
    }),

  /** Update per-trigger preferences for a specific subscription. */
  updatePrefs: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        prefs: PrefsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Tenant safety: only allow update if the subscription belongs to this user.
      await db
        .update(pushSubscriptions)
        .set({ prefs: input.prefs })
        .where(
          and(
            eq(pushSubscriptions.endpoint, input.endpoint),
            eq(pushSubscriptions.userId, ctx.user.id),
          ),
        );
      return { success: true };
    }),
});
