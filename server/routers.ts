import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getUserByOpenId, updatePasswordHash } from "./db";
import { householdsRouter } from "./routers/households";
import { invitesRouter } from "./routers/invites";
import { itemsRouter } from "./routers/items";
import { kioskRouter } from "./routers/kiosk";
import { pushRouter } from "./routers/push";
import { receiptsRouter } from "./routers/receipts";
import { scheduledRouter } from "./routers/scheduled";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(6, "New password must be at least 6 characters"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByOpenId(ctx.user.openId);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account" });
        }
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
        }
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updatePasswordHash(user.id, newHash);
        return { success: true };
      }),
  }),
  households: householdsRouter,
  invites: invitesRouter,
  items: itemsRouter,
  kiosk: kioskRouter,
  push: pushRouter,
  receipts: receiptsRouter,
  scheduled: scheduledRouter,
});

export type AppRouter = typeof appRouter;
