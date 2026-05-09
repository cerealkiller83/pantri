import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createHousehold,
  getHouseholdById,
  getHouseholdsForUser,
  leaveHousehold,
  listHouseholdMembers,
  recordAudit,
  removeMemberFromHousehold,
  updateHousehold,
  updateMemberRole,
} from "../db";
import { requireHouseholdMember, requireHouseholdRole } from "../lib/auth";
import type { KioskPermissions } from "../../drizzle/schema";

const kioskPermissionsSchema = z.object({
  view: z.boolean(),
  add: z.boolean(),
  check: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

export const householdsRouter = router({
  /** List households the current user belongs to */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getHouseholdsForUser(ctx.user.id);
  }),

  /** Get a single household with members */
  get: protectedProcedure
    .input(z.object({ householdId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { household, membership } = await requireHouseholdMember(
        input.householdId,
        ctx.user.id
      );
      const members = await listHouseholdMembers(input.householdId);
      return { household, membership, members };
    }),

  /** Create a new household; creator becomes owner */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        latitude: z.string().max(16).optional(),
        longitude: z.string().max(16).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createHousehold({
        name: input.name,
        createdBy: ctx.user.id,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      });
      await recordAudit({
        householdId: id,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "household.create",
        summary: `${ctx.user.name ?? "Someone"} created the household "${input.name}"`,
      });
      return { id };
    }),

  /** Update household settings; owner/admin only */
  update: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        name: z.string().min(1).max(80).optional(),
        kioskPin: z.string().regex(/^\d{4}$/).nullable().optional(),
        kioskPermissions: kioskPermissionsSchema.optional(),
        latitude: z.string().max(16).nullable().optional(),
        longitude: z.string().max(16).nullable().optional(),
        lowStockThreshold: z.number().int().min(0).max(99).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner", "admin"]);
      const patch: Parameters<typeof updateHousehold>[1] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.kioskPin !== undefined) patch.kioskPin = input.kioskPin;
      if (input.kioskPermissions !== undefined)
        patch.kioskPermissions = input.kioskPermissions as KioskPermissions;
      if (input.latitude !== undefined) patch.latitude = input.latitude;
      if (input.longitude !== undefined) patch.longitude = input.longitude;
      if (input.lowStockThreshold !== undefined)
        patch.lowStockThreshold = input.lowStockThreshold;
      await updateHousehold(input.householdId, patch);
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "household.update",
        summary: `${ctx.user.name ?? "Someone"} updated household settings`,
      });
      return { success: true };
    }),

  /** Owner/admin: remove a different member from the household */
  removeMember: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        userId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner", "admin"]);
      if (input.userId === ctx.user.id) {
        throw new Error("Use 'leave' to remove yourself");
      }
      const members = await listHouseholdMembers(input.householdId);
      const target = members.find((m) => m.userId === input.userId);
      if (!target) throw new Error("Member not found");
      if (target.role === "owner") {
        throw new Error("Cannot remove the owner; transfer ownership first");
      }
      await removeMemberFromHousehold(input.householdId, input.userId);
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "member.remove",
        summary: `${ctx.user.name ?? "An admin"} removed ${target.name ?? "a member"} from the household`,
      });
      return { success: true };
    }),

  /** Owner: transfer ownership to another member; current owner becomes admin */
  transferOwner: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        toUserId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner"]);
      if (input.toUserId === ctx.user.id) {
        throw new Error("You already own this household");
      }
      const members = await listHouseholdMembers(input.householdId);
      const target = members.find((m) => m.userId === input.toUserId);
      if (!target) throw new Error("That person is not a member of this household");
      // Promote target, demote current owner. Order matters: promote first to keep an owner present.
      await updateMemberRole(input.householdId, input.toUserId, "owner");
      await updateMemberRole(input.householdId, ctx.user.id, "admin");
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "member.transferOwner",
        summary: `${ctx.user.name ?? "The owner"} transferred ownership to ${target.name ?? "another member"}`,
      });
      return { success: true };
    }),

  /** Owner: change a member's role between admin and member */
  setRole: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        userId: z.number().int().positive(),
        role: z.enum(["admin", "member"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdRole(input.householdId, ctx.user.id, ["owner"]);
      const members = await listHouseholdMembers(input.householdId);
      const target = members.find((m) => m.userId === input.userId);
      if (!target) throw new Error("Member not found");
      if (target.role === "owner") {
        throw new Error("Use transferOwner to change the owner");
      }
      await updateMemberRole(input.householdId, input.userId, input.role);
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "member.setRole",
        summary: `${ctx.user.name ?? "The owner"} set ${target.name ?? "a member"}'s role to ${input.role}`,
      });
      return { success: true };
    }),

  /** Leave household; owners cannot leave (must transfer first - future) */
  leave: protectedProcedure
    .input(z.object({ householdId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { membership } = await requireHouseholdMember(input.householdId, ctx.user.id);
      if (membership.role === "owner") {
        const members = await listHouseholdMembers(input.householdId);
        if (members.length > 1) {
          throw new Error("Owners must transfer ownership before leaving");
        }
        // sole owner leaving: delete household entirely (future)
      }
      await leaveHousehold(input.householdId, ctx.user.id);
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "member.leave",
        summary: `${ctx.user.name ?? "Someone"} left the household`,
      });
      return { success: true };
    }),
});

// Suppress unused import warning
void getHouseholdById;
