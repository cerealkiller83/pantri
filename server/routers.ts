import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
