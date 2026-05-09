import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  checkOffItem,
  DEFAULT_KIOSK_PERMISSIONS,
  getHouseholdById,
  getItem,
  insertItem,
  listExpiringPantry,
  listItemsByKind,
  recordAudit,
  uncheckItem,
} from "../db";
import type { KioskPermissions } from "../../drizzle/schema";

/**
 * Kiosk router — accessible without a user account.
 * The Family Hub fridge browser cannot easily handle OAuth, so we use
 * a per-household 4-digit PIN to authenticate kiosk operations.
 *
 * Every input requires the householdId + PIN. We re-verify on every call
 * (no kiosk session token) since the fridge browser is shared by family.
 *
 * Permissions are stored on the household and enforced here.
 */

const PIN = z.string().regex(/^\d{4}$/);
const ITEM_KIND = z.enum(["shopping", "pantry", "staple"]);
const CATEGORY = z.enum([
  "produce",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "snacks",
  "household",
  "personal_care",
  "baby",
  "pet",
  "other",
]);
const baseAuth = z.object({
  householdId: z.number().int().positive(),
  pin: PIN,
});

async function verifyKiosk(householdId: number, pin: string) {
  const h = await getHouseholdById(householdId);
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });
  if (!h.kioskPin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kiosk mode is not enabled for this household" });
  }
  if (h.kioskPin !== pin) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN" });
  }
  const perms: KioskPermissions = (h.kioskPermissions as KioskPermissions) ?? DEFAULT_KIOSK_PERMISSIONS;
  return { household: h, permissions: perms };
}

function ensureCan(perms: KioskPermissions, action: keyof KioskPermissions) {
  if (!perms[action]) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Kiosk doesn't have permission to ${action}` });
  }
}

export const kioskRouter = router({
  /** Verify a PIN and return household summary + permissions; used at kiosk entry. */
  verify: publicProcedure
    .input(baseAuth)
    .mutation(async ({ input }) => {
      const { household, permissions } = await verifyKiosk(input.householdId, input.pin);
      return {
        householdId: household.id,
        name: household.name,
        latitude: household.latitude,
        longitude: household.longitude,
        permissions,
      };
    }),

  /** List items in kiosk mode */
  list: publicProcedure
    .input(baseAuth.extend({ kind: ITEM_KIND, includeChecked: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const { permissions } = await verifyKiosk(input.householdId, input.pin);
      ensureCan(permissions, "view");
      return listItemsByKind(input.householdId, input.kind, {
        includeChecked: input.includeChecked,
      });
    }),

  /** Expiring pantry items */
  expiring: publicProcedure
    .input(baseAuth.extend({ days: z.number().int().min(1).max(30).default(7) }))
    .query(async ({ input }) => {
      const { permissions } = await verifyKiosk(input.householdId, input.pin);
      ensureCan(permissions, "view");
      return listExpiringPantry(input.householdId, input.days);
    }),

  /** Add a shopping item (kiosk users add only to the shopping list) */
  add: publicProcedure
    .input(
      baseAuth.extend({
        name: z.string().min(1).max(200),
        category: CATEGORY.default("other"),
        quantity: z.number().int().min(1).max(99).default(1),
      })
    )
    .mutation(async ({ input }) => {
      const verified = await verifyKiosk(input.householdId, input.pin);
      ensureCan(verified.permissions, "add");
      // Items table requires a non-null createdBy; the audit log records actorKind="kiosk".
      // We attribute kiosk inserts to the household creator so DB constraints hold.
      const id = await insertItem({
        householdId: input.householdId,
        kind: "shopping",
        name: input.name.trim(),
        category: input.category,
        quantity: input.quantity,
        unit: "ea",
        createdBy: verified.household.createdBy,
      });
      await recordAudit({
        householdId: input.householdId,
        actorUserId: null,
        actorKind: "kiosk",
        action: "item.add",
        itemId: id,
        summary: `The fridge added ${input.name}`,
      });
      return { id };
    }),

  /** Toggle a shopping item's checked state */
  setChecked: publicProcedure
    .input(baseAuth.extend({ itemId: z.number().int().positive(), checked: z.boolean() }))
    .mutation(async ({ input }) => {
      const verified = await verifyKiosk(input.householdId, input.pin);
      ensureCan(verified.permissions, "check");
      const item = await getItem(input.itemId);
      if (!item || item.householdId !== input.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      if (input.checked) await checkOffItem(input.itemId, verified.household.createdBy);
      else await uncheckItem(input.itemId);
      await recordAudit({
        householdId: input.householdId,
        actorUserId: null,
        actorKind: "kiosk",
        action: input.checked ? "item.check" : "item.uncheck",
        itemId: input.itemId,
        summary: `The fridge ${input.checked ? "checked off" : "unchecked"} ${item.name}`,
      });
      return { success: true };
    }),
});
