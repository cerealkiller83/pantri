import { TRPCError } from "@trpc/server";
import {
  getHouseholdById,
  getHouseholdMembership,
} from "../db";

export type HouseholdRole = "owner" | "admin" | "member";

/**
 * Ensure that `userId` is a member of `householdId`. Returns membership row.
 * Throws FORBIDDEN if not a member, NOT_FOUND if household does not exist.
 */
export async function requireHouseholdMember(householdId: number, userId: number) {
  const household = await getHouseholdById(householdId);
  if (!household) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });
  }
  const membership = await getHouseholdMembership(householdId, userId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this household" });
  }
  return { household, membership };
}

export async function requireHouseholdRole(
  householdId: number,
  userId: number,
  allowed: HouseholdRole[]
) {
  const ctx = await requireHouseholdMember(householdId, userId);
  if (!allowed.includes(ctx.membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Requires role: ${allowed.join(" or ")}`,
    });
  }
  return ctx;
}

/**
 * Generate a 6-char invite code without ambiguous characters.
 * Format: 3 letters + 3 digits, mixed (e.g., 7K9X2P, but using safe alphabet).
 */
const SAFE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const SAFE_NUM = "23456789"; // no 0, 1
export function generateInviteCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      chars.push(SAFE_ALPHA[Math.floor(Math.random() * SAFE_ALPHA.length)]);
    } else {
      chars.push(SAFE_NUM[Math.floor(Math.random() * SAFE_NUM.length)]);
    }
  }
  return chars.join("");
}

/**
 * Format a Date as "3:42 PM" in en-US for audit summaries.
 */
export function formatTimeSummary(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
