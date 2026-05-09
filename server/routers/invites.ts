import { TRPCError } from "@trpc/server";
import { z } from "zod";
import QRCode from "qrcode";
import { protectedProcedure, router } from "../_core/trpc";
import {
  addMembership,
  consumeInvite,
  createInvite,
  getHouseholdById,
  getHouseholdMembership,
  getInviteByCode,
  listInvitesForHousehold,
  recordAudit,
  revokeInvite,
} from "../db";
import { generateInviteCode, requireHouseholdRole } from "../lib/auth";

const ROLE = z.enum(["admin", "member"]);

export const invitesRouter = router({
  /** List active and historical invites for a household; owner/admin only */
  list: protectedProcedure
    .input(z.object({ householdId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner", "admin"]);
      return listInvitesForHousehold(input.householdId);
    }),

  /** Create an invite. Returns the code and a QR data URL the client can render. */
  create: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        email: z.string().email().optional(),
        role: ROLE.default("member"),
        ttlDays: z.number().int().min(1).max(60).default(14),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { household } = await requireHouseholdRole(input.householdId, ctx.user.id, [
        "owner",
        "admin",
      ]);

      // Generate a unique 6-char code (retry on collision)
      let code = generateInviteCode();
      for (let i = 0; i < 5; i++) {
        const existing = await getInviteByCode(code);
        if (!existing) break;
        code = generateInviteCode();
      }

      const expiresAt = new Date(Date.now() + input.ttlDays * 86_400_000);
      const id = await createInvite({
        householdId: input.householdId,
        code,
        email: input.email ?? null,
        role: input.role,
        invitedBy: ctx.user.id,
        expiresAt,
      });

      // Build the join link (frontend route handles redemption)
      const joinUrl = `${input.origin}/join/${code}`;
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 512,
        margin: 1,
        color: { dark: "#1C1917", light: "#FAF6F1" },
      });

      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "invite.create",
        summary: `${ctx.user.name ?? "Someone"} created an invite${input.email ? ` for ${input.email}` : ""}`,
      });

      return {
        id,
        code,
        joinUrl,
        qrDataUrl,
        expiresAt,
        householdName: household.name,
      };
    }),

  /** Look up an invite by code without consuming it (for the join landing page) */
  preview: protectedProcedure
    .input(z.object({ code: z.string().min(4).max(16) }))
    .query(async ({ input }) => {
      const invite = await getInviteByCode(input.code.toUpperCase());
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }
      if (invite.consumedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite expired" });
      }
      const household = await getHouseholdById(invite.householdId);
      return {
        householdId: invite.householdId,
        householdName: household?.name ?? "(unknown)",
        role: invite.role,
        email: invite.email,
      };
    }),

  /** Accept an invite by code */
  accept: protectedProcedure
    .input(z.object({ code: z.string().min(4).max(16) }))
    .mutation(async ({ ctx, input }) => {
      const invite = await getInviteByCode(input.code.toUpperCase());
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }
      if (invite.consumedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite expired" });
      }

      // If already a member, treat as success but don't double-add
      const existing = await getHouseholdMembership(invite.householdId, ctx.user.id);
      if (!existing) {
        await addMembership({
          householdId: invite.householdId,
          userId: ctx.user.id,
          role: invite.role,
        });
      }
      await consumeInvite(invite.id, ctx.user.id);
      await recordAudit({
        householdId: invite.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "member.join",
        summary: `${ctx.user.name ?? "Someone"} joined the household`,
      });
      return { householdId: invite.householdId };
    }),

  /** Revoke an invite (owner/admin) */
  revoke: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        inviteId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner", "admin"]);
      await revokeInvite(input.inviteId);
      return { success: true };
    }),
});
