import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendHouseholdPush } from "../lib/pushSend";
import {
  checkOffItem,
  getItem,
  insertItem,
  listAudit,
  listExpiringPantry,
  listItemsByKind,
  listPricesForItem,
  listRecentlyDeleted,
  recordAudit,
  recordPrice,
  restoreItem,
  softDeleteItem,
  uncheckItem,
  updateItem,
} from "../db";
import { requireHouseholdMember } from "../lib/auth";
import { CATEGORY_BY_SLUG, SOFT_DELETE_DAYS, TEXAS_STORES } from "../../shared/pantri";
import { storageGet, storagePut } from "../storage";
import { ENV } from "../_core/env";

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
const STORE_SLUG = z.enum(TEXAS_STORES.map((s) => s.slug) as [string, ...string[]]);

const baseInputs = z.object({ householdId: z.number().int().positive() });

function withPhotoUrl<T extends { photoKey?: string | null }>(row: T): T & { photoUrl: string | null } {
  if (!row.photoKey) return { ...row, photoUrl: null };
  const r2Base = ENV.r2PublicUrl.replace(/\/+$/, "");
  const photoUrl = r2Base ? `${r2Base}/${row.photoKey}` : `/manus-storage/${row.photoKey}`;
  return { ...row, photoUrl };
}

export const itemsRouter = router({
  /** List items by kind for a household */
  list: protectedProcedure
    .input(
      baseInputs.extend({
        kind: ITEM_KIND,
        includeChecked: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const rows = await listItemsByKind(input.householdId, input.kind, {
        includeChecked: input.includeChecked,
      });
      return rows.map(withPhotoUrl);
    }),

  /** Items soft-deleted within the 30-day undo window */
  listRecentlyDeleted: protectedProcedure
    .input(baseInputs)
    .query(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const cutoff = Date.now() - SOFT_DELETE_DAYS * 86_400_000;
      const rows = await listRecentlyDeleted(input.householdId, cutoff);
      return rows.map(withPhotoUrl);
    }),

  /** Pantry items expiring soon */
  listExpiring: protectedProcedure
    .input(baseInputs.extend({ days: z.number().int().min(1).max(60).default(7) }))
    .query(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const rows = await listExpiringPantry(input.householdId, input.days);
      return rows.map(withPhotoUrl);
    }),

  /** Audit log for a household */
  audit: protectedProcedure
    .input(baseInputs.extend({ limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      return listAudit(input.householdId, input.limit);
    }),

  /** Create a new item */
  create: protectedProcedure
    .input(
      baseInputs.extend({
        kind: ITEM_KIND,
        name: z.string().min(1).max(200),
        category: CATEGORY.default("other"),
        quantity: z.number().int().min(0).max(999).default(1),
        unit: z.string().max(24).default("ea"),
        note: z.string().max(500).optional(),
        expiresAt: z.number().int().optional(),
        lowStockThreshold: z.number().int().min(0).max(99).optional(),
        barcode: z.string().max(64).optional(),
        storeSlug: z.string().max(32).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);
      const id = await insertItem({
        householdId: input.householdId,
        kind: input.kind,
        name: input.name,
        category: input.category,
        quantity: input.quantity,
        unit: input.unit,
        note: input.note ?? null,
        expiresAt: input.expiresAt ?? null,
        lowStockThreshold: input.lowStockThreshold ?? null,
        barcode: input.barcode ?? null,
        storeSlug: input.storeSlug ?? null,
        createdBy: ctx.user.id,
      });
      const cat = CATEGORY_BY_SLUG[input.category];
      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.add",
        itemId: id,
        summary: `${ctx.user.name ?? "Someone"} added ${input.name}${cat ? ` (${cat.name})` : ""} to ${input.kind === "shopping" ? "the shopping list" : input.kind}`,
      });
      // Notify other devices in the household (excludes the actor's own devices).
      if (input.kind === "shopping") {
        void sendHouseholdPush(
          input.householdId,
          {
            title: "New on the list",
            body: `${ctx.user.name ?? "Someone"} added ${input.name}`,
            url: "/",
            trigger: "itemAdded",
          },
          { excludeUserId: ctx.user.id }
        );
      }
      return { id };
    }),

  /** Update an item's fields */
  update: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        name: z.string().min(1).max(200).optional(),
        category: CATEGORY.optional(),
        quantity: z.number().int().min(0).max(999).optional(),
        unit: z.string().max(24).optional(),
        note: z.string().max(500).nullable().optional(),
        expiresAt: z.number().int().nullable().optional(),
        lowStockThreshold: z.number().int().min(0).max(99).nullable().optional(),
        photoKey: z.string().max(256).nullable().optional(),
        kind: ITEM_KIND.optional(),
        storeSlug: z.string().max(32).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      const { itemId, ...patch } = input;
      await updateItem(itemId, patch);
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.edit",
        itemId,
        summary: `${ctx.user.name ?? "Someone"} updated ${existing.name}`,
      });
      return { success: true };
    }),

  /**
   * Adjust pantry quantity by a delta (used for pantry +/- buttons).
   * Auto-promotes to shopping list when quantity drops to or below the low-stock threshold.
   */
  adjustQuantity: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        delta: z.number().int().refine((n) => n !== 0, "Delta must be non-zero"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      const next = Math.max(0, Math.min(999, existing.quantity + input.delta));
      await updateItem(input.itemId, { quantity: next });
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: input.delta > 0 ? "item.restock" : "item.use",
        itemId: input.itemId,
        summary:
          input.delta > 0
            ? `${ctx.user.name ?? "Someone"} restocked ${existing.name} (${existing.quantity} → ${next})`
            : `${ctx.user.name ?? "Someone"} used ${Math.abs(input.delta)} ${existing.unit} of ${existing.name} (${existing.quantity} → ${next})`,
      });

      // Auto-promote: if it just crossed the threshold from above, add to shopping list.
      let promotedShoppingItemId: number | null = null;
      if (
        existing.kind === "pantry" &&
        existing.lowStockThreshold !== null &&
        existing.lowStockThreshold !== undefined &&
        existing.quantity > existing.lowStockThreshold &&
        next <= existing.lowStockThreshold
      ) {
        promotedShoppingItemId = await insertItem({
          householdId: existing.householdId,
          kind: "shopping",
          name: existing.name,
          category: existing.category,
          quantity: 1,
          unit: existing.unit,
          barcode: existing.barcode,
          photoKey: existing.photoKey,
          createdBy: ctx.user.id,
        });
        await recordAudit({
          householdId: existing.householdId,
          actorUserId: ctx.user.id,
          actorKind: "user",
          action: "item.lowstock_promote",
          itemId: promotedShoppingItemId,
          summary: `${existing.name} hit low stock — added to the shopping list automatically`,
        });
      }

      return { quantity: next, promotedShoppingItemId };
    }),

  /** Soft delete (30-day undo) */
  softDelete: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      await softDeleteItem(input.itemId, ctx.user.id);
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.delete",
        itemId: input.itemId,
        summary: `${ctx.user.name ?? "Someone"} removed ${existing.name}`,
      });
      return { success: true };
    }),

  /** Restore a soft-deleted item */
  restore: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      await restoreItem(input.itemId);
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.restore",
        itemId: input.itemId,
        summary: `${ctx.user.name ?? "Someone"} restored ${existing.name}`,
      });
      return { success: true };
    }),

  /** Toggle check-off (shopping items) */
  setChecked: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive(), checked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      if (input.checked) {
        await checkOffItem(input.itemId, ctx.user.id);
      } else {
        await uncheckItem(input.itemId);
      }
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: input.checked ? "item.check" : "item.uncheck",
        itemId: input.itemId,
        summary: `${ctx.user.name ?? "Someone"} ${input.checked ? "checked off" : "unchecked"} ${existing.name}`,
      });
      if (input.checked) {
        void sendHouseholdPush(
          existing.householdId,
          {
            title: "Got it",
            body: `${ctx.user.name ?? "Someone"} checked off ${existing.name}`,
            url: "/",
            trigger: "itemChecked",
          },
          { excludeUserId: ctx.user.id }
        );
      }
      return { success: true };
    }),

  /** Promote a pantry/staple item to the shopping list (creates a new shopping item) */
  promoteToShopping: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().min(1).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const source = await getItem(input.itemId);
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(source.householdId, ctx.user.id);
      const newId = await insertItem({
        householdId: source.householdId,
        kind: "shopping",
        name: source.name,
        category: source.category,
        quantity: input.quantity,
        unit: source.unit,
        barcode: source.barcode,
        photoKey: source.photoKey,
        createdBy: ctx.user.id,
      });
      await recordAudit({
        householdId: source.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.promote",
        itemId: newId,
        summary: `${ctx.user.name ?? "Someone"} added ${source.name} to the shopping list`,
      });
      return { id: newId };
    }),

  /** Record a price observation for an item at one of the Texas stores */
  recordPrice: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        storeSlug: STORE_SLUG,
        priceCents: z.number().int().min(0).max(10_000_00),
        quantity: z.number().int().min(1).default(1),
        unit: z.string().max(24).default("ea"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      await recordPrice({
        itemId: input.itemId,
        householdId: existing.householdId,
        storeSlug: input.storeSlug,
        priceCents: input.priceCents,
        quantity: input.quantity,
        unit: input.unit,
        recordedBy: ctx.user.id,
      });
      return { success: true };
    }),

  /** Upload a photo for an item; returns the storage key + url to set on the item */
  uploadPhoto: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        contentType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif)$/),
        dataBase64: z.string().min(1).max(8_000_000), // ~6MB binary cap
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      const buf = Buffer.from(input.dataBase64, "base64");
      const ext = input.contentType.split("/")[1] === "jpeg" ? "jpg" : input.contentType.split("/")[1];
      const relKey = `pantri/h${existing.householdId}/i${input.itemId}.${ext}`;
      const { key, url } = await storagePut(relKey, buf, input.contentType);
      await updateItem(input.itemId, { photoKey: key });
      await recordAudit({
        householdId: existing.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "item.photo",
        itemId: input.itemId,
        summary: `${ctx.user.name ?? "Someone"} added a photo to ${existing.name}`,
      });
      return { key, url };
    }),

  /** List price history for an item */
  prices: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const existing = await getItem(input.itemId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await requireHouseholdMember(existing.householdId, ctx.user.id);
      return listPricesForItem(input.itemId);
    }),
});
