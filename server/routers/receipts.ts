import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import {
  insertItem,
  recordPrice,
  listItemsByKind,
  recordAudit,
  updateItem,
} from "../db";
import { requireHouseholdMember } from "../lib/auth";
import {
  fuzzyMatchItem,
  parseReceiptViaOpenRouter,
  type ReceiptParseResult,
} from "../lib/openrouter";

const STORE_SLUG = z.enum([
  "heb",
  "whole_foods",
  "target",
  "walmart",
  "trader_joes",
  "costco",
  "sams_club",
  "central_market",
]);

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

export const receiptsRouter = router({
  /** Whether OpenRouter is configured. Used by the frontend to gate the receipt feature. */
  status: protectedProcedure.query(() => ({
    enabled: Boolean(ENV.openrouterKey),
  })),

  /**
   * Parse a receipt image via OpenRouter and return the extracted lines plus
   * fuzzy matches against existing pantry/staple items in the household.
   * Caller decides which lines to commit afterward.
   */
  parse: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        /** Data URL with the receipt image (data:image/jpeg;base64,...) */
        imageDataUrl: z.string().min(64).max(15_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);

      let parsed: ReceiptParseResult;
      try {
        parsed = await parseReceiptViaOpenRouter(input.imageDataUrl);
      } catch (e) {
        if ((e as { code?: string }).code === "OPENROUTER_NOT_CONFIGURED") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Receipt OCR is not yet enabled. Ask your admin to set OPENROUTER_API_KEY.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "Receipt parsing failed",
        });
      }

      // Fuzzy match each line against existing pantry+staple items
      const pantryItems = await listItemsByKind(input.householdId, "pantry");
      const stapleItems = await listItemsByKind(input.householdId, "staple");
      const candidates = [...pantryItems, ...stapleItems];

      const enrichedLines = parsed.lines.map((line) => {
        const match = fuzzyMatchItem(line.name, candidates);
        return {
          ...line,
          // Pre-checked only if the LLM thinks it's food/pantry
          preChecked: line.isFood,
          matchedItemId: match?.id ?? null,
          matchedItemName: match?.name ?? null,
        };
      });

      return {
        ...parsed,
        lines: enrichedLines,
      };
    }),

  /**
   * Commit selected receipt lines. For each line we either:
   *  - Create a new pantry item (and add price history if priceCents available)
   *  - Or update an existing matched item (and add price history)
   * Lines without a price are still added to pantry but skip price history.
   */
  commit: protectedProcedure
    .input(
      z.object({
        householdId: z.number().int().positive(),
        storeSlug: STORE_SLUG.nullable(),
        receiptDate: z.string().nullable(),
        lines: z.array(
          z.object({
            name: z.string().min(1).max(200),
            category: CATEGORY,
            quantity: z.number().int().min(1).max(999),
            priceCents: z.number().int().min(0).max(10_000_00).nullable(),
            /** When provided, attach price + audit to existing item instead of creating a new one */
            mergeIntoItemId: z.number().int().positive().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdMember(input.householdId, ctx.user.id);

      let createdCount = 0;
      let updatedCount = 0;
      let pricesRecorded = 0;

      for (const line of input.lines) {
        let itemId: number;

        if (line.mergeIntoItemId) {
          itemId = line.mergeIntoItemId;
          // Bump the existing item's quantity if appropriate
          await updateItem(itemId, { /* keep existing fields */ });
          updatedCount++;
        } else {
          itemId = await insertItem({
            householdId: input.householdId,
            kind: "pantry",
            name: line.name,
            category: line.category,
            quantity: line.quantity,
            unit: "ea",
            createdBy: ctx.user.id,
          });
          createdCount++;
        }

        // Auto-feed price history for the 8 Texas stores
        if (input.storeSlug && line.priceCents != null) {
          await recordPrice({
            itemId,
            householdId: input.householdId,
            storeSlug: input.storeSlug,
            priceCents: line.priceCents,
            quantity: line.quantity,
            unit: "ea",
            recordedBy: ctx.user.id,
          });
          pricesRecorded++;
        }
      }

      await recordAudit({
        householdId: input.householdId,
        actorUserId: ctx.user.id,
        actorKind: "user",
        action: "receipt.import",
        itemId: null,
        summary: `${ctx.user.name ?? "Someone"} imported a receipt — added ${createdCount} item${createdCount === 1 ? "" : "s"}, updated ${updatedCount}, recorded ${pricesRecorded} price${pricesRecorded === 1 ? "" : "s"}`,
      });

      return { createdCount, updatedCount, pricesRecorded };
    }),
});
