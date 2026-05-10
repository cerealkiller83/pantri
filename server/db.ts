import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLog,
  householdMembers,
  households,
  invites,
  itemPrices,
  items,
  magicLinkTokens,
  pushSubscriptions,
  users,
  type InsertAuditEntry,
  type InsertHousehold,
  type InsertHouseholdMember,
  type InsertInvite,
  type InsertItem,
  type InsertItemPrice,
  type InsertPushSubscription,
  type InsertUser,
  type KioskPermissions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/* -------------------------------------------------------------- USERS */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function createUserWithPassword(opts: {
  email: string;
  passwordHash: string;
  name: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const openId = `email:${opts.email}`;
  await db.insert(users).values({
    openId,
    email: opts.email,
    passwordHash: opts.passwordHash,
    name: opts.name,
    loginMethod: "password",
    lastSignedIn: new Date(),
  });
}

/* --------------------------------------------------------- HOUSEHOLDS */

export const DEFAULT_KIOSK_PERMISSIONS: KioskPermissions = {
  view: true,
  add: true,
  check: true,
  edit: false,
  delete: false,
};

export async function createHousehold(input: {
  name: string;
  createdBy: number;
  latitude?: string | null;
  longitude?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const insertVal: InsertHousehold = {
    name: input.name,
    createdBy: input.createdBy,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    kioskPermissions: DEFAULT_KIOSK_PERMISSIONS,
  };
  const [result] = await db.insert(households).values(insertVal);
  const id = (result as { insertId: number }).insertId;
  // Create owner membership
  await db.insert(householdMembers).values({
    householdId: id,
    userId: input.createdBy,
    role: "owner",
  } satisfies InsertHouseholdMember);
  return id;
}

export async function getHouseholdById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return rows[0];
}

export async function getHouseholdsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: households.id,
      name: households.name,
      kioskPin: households.kioskPin,
      kioskPermissions: households.kioskPermissions,
      latitude: households.latitude,
      longitude: households.longitude,
      lowStockThreshold: households.lowStockThreshold,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .orderBy(desc(householdMembers.joinedAt));
}

export async function getHouseholdMembership(householdId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function listHouseholdMembers(householdId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      role: householdMembers.role,
      nickname: householdMembers.nickname,
      joinedAt: householdMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId));
}

export async function updateHousehold(
  householdId: number,
  patch: Partial<{
    name: string;
    kioskPin: string | null;
    kioskPermissions: KioskPermissions;
    latitude: string | null;
    longitude: string | null;
    lowStockThreshold: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(households).set(patch).where(eq(households.id, householdId));
}

export async function leaveHousehold(householdId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .delete(householdMembers)
    .where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))
    );
}

/** Owner/admin: remove a different user from the household. */
export async function removeMemberFromHousehold(householdId: number, userId: number) {
  return leaveHousehold(householdId, userId);
}

/** Owner: change a member's role within a household. */
export async function updateMemberRole(
  householdId: number,
  userId: number,
  role: "owner" | "admin" | "member"
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(householdMembers)
    .set({ role })
    .where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))
    );
}

/* ----------------------------------------------------------- INVITES */

export async function createInvite(input: InsertInvite) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(invites).values(input);
  return (result as { insertId: number }).insertId;
}

export async function getInviteByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
  return rows[0];
}

export async function listInvitesForHousehold(householdId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(invites)
    .where(eq(invites.householdId, householdId))
    .orderBy(desc(invites.createdAt));
}

export async function consumeInvite(inviteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(invites)
    .set({ consumedBy: userId, consumedAt: new Date() })
    .where(eq(invites.id, inviteId));
}

export async function revokeInvite(inviteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(invites).where(eq(invites.id, inviteId));
}

export async function addMembership(input: InsertHouseholdMember) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(householdMembers).values(input).onDuplicateKeyUpdate({
    set: { role: input.role ?? "member" },
  });
}

/* ------------------------------------------------------------- ITEMS */

export async function listItemsByKind(
  householdId: number,
  kind: "shopping" | "pantry" | "staple",
  opts: { includeDeleted?: boolean; includeChecked?: boolean } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(items.householdId, householdId), eq(items.kind, kind)];
  if (!opts.includeDeleted) filters.push(isNull(items.deletedAt));
  if (kind === "shopping" && !opts.includeChecked) filters.push(isNull(items.checkedAt));
  return db
    .select()
    .from(items)
    .where(and(...filters))
    .orderBy(desc(items.createdAt));
}

export async function listRecentlyDeleted(householdId: number, sinceMs: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(items)
    .where(
      and(
        eq(items.householdId, householdId),
        isNotNull(items.deletedAt),
        gt(items.deletedAt, sinceMs)
      )
    )
    .orderBy(desc(items.deletedAt));
}

export async function getItem(itemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  return rows[0];
}

export async function insertItem(input: InsertItem) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(items).values(input);
  return (result as { insertId: number }).insertId;
}

export async function updateItem(itemId: number, patch: Partial<InsertItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(items).set(patch).where(eq(items.id, itemId));
}

export async function softDeleteItem(itemId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(items)
    .set({ deletedAt: Date.now(), deletedBy: userId })
    .where(eq(items.id, itemId));
}

export async function restoreItem(itemId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(items)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(items.id, itemId));
}

export async function checkOffItem(itemId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(items)
    .set({ checkedAt: Date.now(), checkedBy: userId })
    .where(eq(items.id, itemId));
}

export async function uncheckItem(itemId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(items)
    .set({ checkedAt: null, checkedBy: null })
    .where(eq(items.id, itemId));
}

/* ---------------------------------------------------- PANTRY HELPERS */

/** Pantry items expiring within `days` days, not deleted */
export async function listExpiringPantry(householdId: number, days: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = Date.now() + days * 86_400_000;
  return db
    .select()
    .from(items)
    .where(
      and(
        eq(items.householdId, householdId),
        eq(items.kind, "pantry"),
        isNull(items.deletedAt),
        isNotNull(items.expiresAt),
        lte(items.expiresAt, cutoff)
      )
    )
    .orderBy(items.expiresAt);
}

/* ------------------------------------------------------ ITEM PRICES */

export async function recordPrice(input: InsertItemPrice) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(itemPrices).values(input);
}

export async function listPricesForItem(itemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(itemPrices)
    .where(eq(itemPrices.itemId, itemId))
    .orderBy(desc(itemPrices.recordedAt));
}

/* ---------------------------------------------------------- AUDIT */

export async function recordAudit(entry: InsertAuditEntry) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLog).values(entry);
  } catch (err) {
    console.error("[Audit] Failed to record:", err);
  }
}

export async function listAudit(householdId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.householdId, householdId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/* ----------------------------------------------------- PUSH SUBS */

export async function upsertPushSubscription(input: InsertPushSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        userId: input.userId,
        householdId: input.householdId,
        p256dh: input.p256dh,
        authKey: input.authKey,
        prefs: input.prefs,
        deviceLabel: input.deviceLabel ?? null,
      },
    });
}

export async function listPushSubsForHousehold(householdId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));
}

export async function deletePushSubscription(endpoint: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listPushSubscriptionsForHousehold(householdId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));
}

export async function listPushSubscriptionsForExpiringPantry(householdId: number) {
  return listPushSubscriptionsForHousehold(householdId);
}

/** All households (used by scheduled tasks for expiry scans). */
export async function listAllHouseholdIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: households.id }).from(households);
  return rows.map((r) => r.id);
}

// Suppress unused-warning for helpers exported for future use
void or;

/* ------------------------------------------------ MAGIC LINK AUTH */

import { nanoid } from "nanoid";

export async function createMagicLinkToken(email: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = nanoid(48);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await db.insert(magicLinkTokens).values({ token, email, expiresAt });
  return token;
}

export async function findMagicLinkToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.token, token),
        isNull(magicLinkTokens.usedAt),
        gt(magicLinkTokens.expiresAt, now)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markMagicLinkUsed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(eq(magicLinkTokens.id, id));
}

export async function upsertUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Use email as a stable openId so we can find the user by email later
  const openId = `email:${email}`;
  const existing = await getUserByOpenId(openId);
  if (existing) {
    await upsertUser({ openId, lastSignedIn: new Date() });
    return existing;
  }
  await db.insert(users).values({
    openId,
    email,
    name: email.split("@")[0],
    loginMethod: "magic_link",
    lastSignedIn: new Date(),
  });
  const created = await getUserByOpenId(openId);
  if (!created) throw new Error("Failed to create user");
  return created;
}
void sql;
