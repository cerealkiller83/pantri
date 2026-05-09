import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * USERS
 * Core user table backing OAuth.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * HOUSEHOLDS
 * Each household is a fully isolated tenant. A user can belong to multiple via memberships.
 */
export const households = mysqlTable(
  "households",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    /** 4-digit PIN for Family Hub kiosk access; null = kiosk disabled */
    kioskPin: varchar("kioskPin", { length: 8 }),
    /** Permissions allowed in kiosk mode (default applied in app code) */
    kioskPermissions: json("kioskPermissions").$type<KioskPermissions>(),
    /** Latitude/longitude for sunset-based dark mode on the fridge */
    latitude: varchar("latitude", { length: 16 }),
    longitude: varchar("longitude", { length: 16 }),
    /** Low-stock threshold default for new pantry items */
    lowStockThreshold: int("lowStockThreshold").default(1).notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    createdByIdx: index("households_createdBy_idx").on(t.createdBy),
  })
);

export type Household = typeof households.$inferSelect;
export type InsertHousehold = typeof households.$inferInsert;

export type KioskPermissions = {
  view: boolean;
  add: boolean;
  check: boolean;
  edit: boolean;
  delete: boolean;
};

/**
 * HOUSEHOLD MEMBERS
 * Many-to-many between users and households with a role.
 */
export const householdMembers = mysqlTable(
  "household_members",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
    /** Display name override within this household (e.g., "Mom"). Optional. */
    nickname: varchar("nickname", { length: 60 }),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("hm_household_user_uniq").on(t.householdId, t.userId),
    userIdx: index("hm_user_idx").on(t.userId),
  })
);

export type HouseholdMember = typeof householdMembers.$inferSelect;
export type InsertHouseholdMember = typeof householdMembers.$inferInsert;

/**
 * INVITES
 * One row supports all three flows: email link, 6-char code, QR.
 * - `code` is always present and used by both code + QR flows
 * - `email` is set when an email link was generated
 * - `consumedBy` / `consumedAt` mark single-use redemption
 */
export const invites = mysqlTable(
  "invites",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull(),
    /** 6-char share code, e.g. "7K9X2P" — globally unique */
    code: varchar("code", { length: 16 }).notNull().unique(),
    /** Optional target email when sent as link */
    email: varchar("email", { length: 320 }),
    /** Role granted on acceptance */
    role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
    invitedBy: int("invitedBy").notNull(),
    expiresAt: timestamp("expiresAt"),
    consumedBy: int("consumedBy"),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    householdIdx: index("invites_household_idx").on(t.householdId),
  })
);

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;

/**
 * ITEMS
 * Unified shopping + pantry item table with `kind` discriminator.
 * - kind=shopping: list mode (need to buy)
 * - kind=pantry: inventory mode (have it)
 * - kind=staple: a recurring template; can be re-added quickly
 */
export const items = mysqlTable(
  "items",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull(),
    kind: mysqlEnum("kind", ["shopping", "pantry", "staple"]).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    category: mysqlEnum("category", [
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
    ])
      .default("other")
      .notNull(),
    /** Quantity numeric value; for shopping list, count of units; for pantry, current stock */
    quantity: int("quantity").default(1).notNull(),
    unit: varchar("unit", { length: 24 }).default("ea").notNull(),
    /** Free-form note */
    note: text("note"),
    /** Open Food Facts barcode (EAN/UPC) when scanned */
    barcode: varchar("barcode", { length: 32 }),
    /** Storage key for photo (S3 / R2) */
    photoKey: varchar("photoKey", { length: 256 }),
    /** Pantry-only: expiry date as unix ms timestamp; null if not tracked */
    expiresAt: bigint("expiresAt", { mode: "number" }),
    /** Pantry-only: low-stock threshold (auto-promote when quantity <=) */
    lowStockThreshold: int("lowStockThreshold"),
    /** Shopping-only: marked checked off (purchased). When checked, audit fires. */
    checkedAt: bigint("checkedAt", { mode: "number" }),
    checkedBy: int("checkedBy"),
    /** Soft delete */
    deletedAt: bigint("deletedAt", { mode: "number" }),
    deletedBy: int("deletedBy"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    hhKindIdx: index("items_hh_kind_idx").on(t.householdId, t.kind),
    deletedIdx: index("items_deleted_idx").on(t.deletedAt),
    barcodeIdx: index("items_barcode_idx").on(t.barcode),
  })
);

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

/**
 * ITEM PRICES
 * Price history per item per Texas retailer.
 * Store list is fixed at the application level (see shared/stores.ts).
 */
export const itemPrices = mysqlTable(
  "item_prices",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("itemId").notNull(),
    householdId: int("householdId").notNull(),
    /** Slug for one of the eight Texas retailers */
    storeSlug: varchar("storeSlug", { length: 32 }).notNull(),
    /** Price in cents (USD) */
    priceCents: int("priceCents").notNull(),
    /** Quantity that this price refers to (e.g., 12 eggs at $3.99) */
    quantity: int("quantity").default(1).notNull(),
    unit: varchar("unit", { length: 24 }).default("ea").notNull(),
    recordedBy: int("recordedBy").notNull(),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  (t) => ({
    itemIdx: index("prices_item_idx").on(t.itemId),
    hhStoreIdx: index("prices_hh_store_idx").on(t.householdId, t.storeSlug),
  })
);

export type ItemPrice = typeof itemPrices.$inferSelect;
export type InsertItemPrice = typeof itemPrices.$inferInsert;

/**
 * AUDIT LOG
 * Human-readable activity feed per household.
 */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull(),
    actorUserId: int("actorUserId"),
    /** "kiosk" if the actor was the Family Hub kiosk PIN session */
    actorKind: mysqlEnum("actorKind", ["user", "kiosk"]).default("user").notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    /** Optional reference to an item */
    itemId: int("itemId"),
    /** Pre-rendered display string ("Sarah added Eggs at 3:42 PM") */
    summary: text("summary").notNull(),
    /** JSON metadata for richer rendering later */
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    hhCreatedIdx: index("audit_hh_created_idx").on(t.householdId, t.createdAt),
  })
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type InsertAuditEntry = typeof auditLog.$inferInsert;

/**
 * PUSH SUBSCRIPTIONS
 * Web-Push subscription endpoints per user per household.
 */
export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    householdId: int("householdId").notNull(),
    endpoint: varchar("endpoint", { length: 768 }).notNull(),
    p256dh: varchar("p256dh", { length: 256 }).notNull(),
    authKey: varchar("authKey", { length: 256 }).notNull(),
    /** Per-trigger preferences (default applied in app code) */
    prefs: json("prefs").$type<PushPrefs>().notNull(),
    deviceLabel: varchar("deviceLabel", { length: 80 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("push_user_idx").on(t.userId),
    endpointIdx: index("push_endpoint_idx").on(t.endpoint),
  })
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

export type PushPrefs = {
  itemAdded: boolean;
  itemChecked: boolean;
  expiringSoon: boolean;
  expired: boolean;
};

/**
 * MAGIC LINK TOKENS
 * One-time login tokens for passwordless email authentication.
 */
export const magicLinkTokens = mysqlTable(
  "magic_link_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    email: varchar("email", { length: 320 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("mlt_token_idx").on(t.token),
    emailIdx: index("mlt_email_idx").on(t.email),
  })
);

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
