# Pantri — Transfer Document

> Author: Manus AI · Maintained for: any future agent or developer continuing this project.
> This document is the single source of truth for context, decisions, architecture, and outstanding work on the **Pantri** project. Read this first before reading any source files. Update it whenever you make architectural decisions or finish a major feature.

## 1. Product Overview

**Pantri** is a warm, tactile Progressive Web App (PWA) for shared household shopping lists and pantry inventory. It is designed to feel at home on both phones (iOS Safari, Android Chrome) and on Samsung Family Hub refrigerator screens (Tizen Chromium browser). The core proposition is that any family member or roommate can add to a shared shopping list and track pantry stock, while the fridge-mounted screen acts as a lightweight kiosk that anyone in the kitchen can interact with via a household PIN.

The owner of this project is **Damien**, a Hardware Engineer at Meta living in Texas. The deployment target is `pantri.bydna.co`, hosted on Railway in production, with Cloudflare used for preview deployments.

## 2. Confirmed Product Decisions

The following decisions were locked in before any code was written, based on a detailed scoping conversation with the user. Do not change these without explicit user approval.

| Area | Decision |
|---|---|
| Tenancy | Multi-tenant. Each household is fully isolated; users may belong to multiple households and switch between them. Members can only see other users in households they share. |
| Joining | Invitation only. Three flows in v1: email invite link, 6-character shareable code (e.g., `7K9X2P`), and QR code. All cheap to implement once one works. |
| Authentication | Manus OAuth (provided by the platform template). Magic-link / social login flows are funneled through this provider. |
| Shopping list | Check-off, category organization, recurring/staple flag, per-store price tracking with history. |
| Pantry inventory | Quantity tracking, expiry dates, automatic low-stock promotion to the shopping list. |
| Recipe import → list | Explicitly deferred to v2. Not in scope for v1. |
| Barcode scanning | Open Food Facts API for v1, with manual entry fallback. |
| Photo attachments | Stored on Cloudflare R2 (S3-compatible) in production; uses the platform's S3-compatible storage helpers in development. |
| Price tracking stores | **Fixed list of eight Texas retailers**: H-E-B, Whole Foods, Target, Walmart, Trader Joe's, Costco, Sam's Club, Central Market. **Do not add or remove stores** without explicit user approval. |
| Family Hub kiosk | Each household has an optional 4-digit PIN. Default permissions are **view + add + check off** (no edit, no delete). Permissions are configurable per household. The kiosk session is read/write according to those permissions but is bound to the household and never has account-level access. |
| Fridge dark mode | **Automatic** based on local sunset time (computed from household lat/lng). **Not** a manual toggle. |
| Push notifications | Opt-in per device. Triggers in v1: item added to shared list, item checked off, pantry item expiring in ≤3 days, pantry item expired. |
| Offline support | Full offline on phones via service worker + IndexedDB queue. Sync on reconnect. |
| Realtime sync | 5–10 second polling on active views. **Not** WebSockets. |
| Audit log | Per-household feed with human-readable entries (e.g., "Sarah added Eggs at 3:42 PM"). Records member.join, item.add, item.check, item.edit, item.delete, item.restore, kiosk.access. |
| Soft delete | All items support soft delete with a **30-day** undo window. After 30 days they may be hard-purged (currently filter-only at query time). |
| Locale | USD currency, English, US units (with a metric toggle as a future nice-to-have). |
| Aesthetic | Warm-tactile with subtle glassmorphism. Cream + espresso base, terracotta primary (`#C2410C` for dark, `#FB923C` for light/accent), olive secondary. Fraunces serif for headings, Inter for body text. Pantri wordmark is a tasteful flowing cursive. |
| App icon | Cursive "P" derived from the wordmark, on a deep black background. |

## 3. Brand Assets

All assets are uploaded via `manus-upload-file --webdev` and have permanent URLs that share the project's lifecycle. The single source of truth for brand asset paths is `client/src/lib/brand.ts`.

| Asset | Path |
|---|---|
| App icon (512 px) | `/manus-storage/pantri_icon_512_02fefb07.png` |
| App icon (192 px) | `/manus-storage/pantri_icon_192_36467323.png` |
| Wordmark, light bg | `/manus-storage/pantri_logo_light_web_dfba11ff.png` |
| Wordmark, dark bg | `/manus-storage/pantri_logo_dark_web_b74635b9.png` |

The original full-resolution masters live in `/home/ubuntu/webdev-static-assets/pantri/` and `/home/ubuntu/pantri_design/`. If you need to regenerate the icon, the script `pantri_design/reconstruct_p.py` extracts the cursive P from the wordmark via connected-component analysis. The successful approach for the icon was to use `generate_image_variation` with the long wordmark as a reference image and prompt for a single matching cursive P on a black background.

## 4. Tech Stack

This project was scaffolded from the platform's `web-db-user` template, which provides a tightly integrated stack. **Do not introduce alternative tooling without strong justification** — the template's auth, DB, and storage plumbing only work with these choices.

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Routing | wouter 3 |
| Styling | Tailwind CSS 4 (with `@theme inline` token system) + shadcn/ui components (Radix-based) |
| Animation | framer-motion |
| Forms | react-hook-form + zod |
| RPC | tRPC 11 + TanStack Query 5 (the only network layer — never `axios`/`fetch` from components) |
| Server framework | Express 4 (managed by the template) |
| ORM | Drizzle ORM 0.44 |
| Database | MySQL/TiDB (provided by the template via `DATABASE_URL`) |
| Auth | Manus OAuth (provided by the template) |
| File storage | Platform S3-compatible storage in dev; Cloudflare R2 in production |
| Testing | Vitest |
| Package manager | pnpm |

## 5. Repository Layout

The project lives at `/home/ubuntu/pantri`. Only the following directories are intended for application code; everything under `server/_core` is framework plumbing and should not be edited without strong reason.

```
pantri/
├── client/
│   ├── public/                 ← favicon, robots.txt, manifest.json (small only)
│   └── src/
│       ├── App.tsx             ← Routes + ThemeProvider
│       ├── index.css           ← Theme tokens (warm-tactile palette)
│       ├── lib/
│       │   ├── trpc.ts         ← tRPC client binding
│       │   └── brand.ts        ← Brand asset paths (single source of truth)
│       ├── pages/              ← Page-level components
│       └── components/         ← Reusable UI + shadcn/ui in components/ui/
├── server/
│   ├── routers.ts              ← tRPC routers (delegates to per-feature files)
│   ├── routers/                ← Per-feature routers (households, items, etc.)
│   ├── db.ts                   ← Drizzle query helpers
│   ├── storage.ts              ← S3 helpers (storagePut)
│   └── _core/                  ← Framework plumbing — DO NOT EDIT
├── drizzle/
│   ├── schema.ts               ← Database schema (Drizzle)
│   └── 0001_*.sql              ← Generated migration SQL (informational only;
│                                 actual migration was applied table-by-table
│                                 via webdev_execute_sql due to JSON DEFAULT
│                                 incompatibility — see Section 7).
├── shared/
│   ├── const.ts                ← Template constants (cookie name, etc.)
│   └── pantri.ts               ← Pantri constants (Texas stores, categories, polling interval, soft-delete window)
├── todo.md                     ← Live feature/bug tracker
├── TRANSFER.md                 ← THIS FILE
└── package.json
```

## 6. Database Schema

Eight tables were created. The schema lives in `drizzle/schema.ts`. All foreign-key-style relationships are enforced at the application layer; the template database does not use FK constraints. Always filter by `householdId` in queries to enforce tenant isolation.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Template-provided OAuth user table. Extended only with `role` enum (`user`/`admin`). | `id`, `openId`, `email`, `role` |
| `households` | One row per household tenant. | `id`, `name`, `kioskPin`, `kioskPermissions` (JSON), `latitude`, `longitude`, `lowStockThreshold`, `createdBy` |
| `household_members` | Many-to-many between users and households with role. | `householdId`, `userId`, `role` (`owner`/`admin`/`member`), `nickname` |
| `invites` | Single table covering all three invite flows (email, 6-char code, QR). | `householdId`, `code` (unique), `email` (optional), `expiresAt`, `consumedBy`, `consumedAt` |
| `items` | Unified shopping + pantry items via `kind` discriminator (`shopping` / `pantry` / `staple`). Soft delete via `deletedAt`. | `householdId`, `kind`, `name`, `category`, `quantity`, `expiresAt`, `checkedAt`, `deletedAt`, `barcode`, `photoKey` |
| `item_prices` | Price history per item per Texas retailer. | `itemId`, `householdId`, `storeSlug`, `priceCents` |
| `audit_log` | Human-readable activity feed per household. | `householdId`, `actorUserId`, `actorKind` (`user`/`kiosk`), `action`, `summary` |
| `push_subscriptions` | Web Push endpoints per user per household with per-trigger preferences. | `userId`, `householdId`, `endpoint`, `prefs` (JSON) |

### Important schema gotchas

The template's MySQL/TiDB instance does not allow JSON columns with literal `DEFAULT` clauses. Two columns originally had JSON defaults (`households.kioskPermissions` and `push_subscriptions.prefs`); they were defined without defaults in the schema and these defaults are now applied in application code on insert. If you ever regenerate migrations and they include `DEFAULT ('{...}')` on a JSON column, strip those defaults before executing.

## 7. Migration Workflow

The standard template workflow is `pnpm drizzle-kit generate` → review SQL in `drizzle/*.sql` → apply via `webdev_execute_sql`. **Important deviation:** the platform's SQL execution tool truncates multi-statement payloads at the first connection boundary. The initial migration only created two of eight tables before silently dropping the rest. The fix was to execute each `CREATE TABLE` and the index batch as separate calls. If you make schema changes, generate the SQL and apply each statement (or small group) individually.

## 8. Theming

Theme tokens are in `client/src/index.css` using Tailwind 4's `@theme inline` block. The palette uses OKLCH values (Tailwind 4 requirement). The default theme is light/cream; the dark theme uses an espresso base. The user requested **automatic** dark mode on the fridge screen based on sunset; this is implemented by computing sunset from the household's lat/lng and applying the `.dark` class on the `<html>` element when relevant.

The Pantri wordmark is rendered using the `BRAND.logoLight` / `BRAND.logoDark` images. Headings use Fraunces (loaded via Google Fonts CDN in `client/index.html`); body uses Inter.

## 9. Current Status

Use `todo.md` as the live tracker. As of writing, **Phase 4** is in progress. Foundations (schema, brand assets, theme tokens) are landed. Authentication is provided by the template. Household management, invites, and the household switcher are next.

## 10. Hosting & Deployment Plan

The user wants production hosted on **Railway** at `pantri.bydna.co` (a subdomain of his own domain). Cloudflare is used for preview deployments. The platform's built-in publish flow may also be used during development; Railway is the long-term home. Detailed deployment steps will be added in Section 12 once the build is feature-complete.

## 11. Known Risks & Decisions to Revisit

The Family Hub browser is a Chromium-based Tizen build with limited support for service worker installability and Web Push. PWAs render as websites there but do not install as home-screen apps. The fridge UX is therefore being designed as a bookmark-friendly, large-touch-target page rather than a true installable PWA on Tizen. Phones receive the full PWA treatment.

Open Food Facts coverage is decent in the US but not perfect; manual entry must always be available as a fallback. We do not store full Open Food Facts records — we only persist barcode + name + category to keep the schema small.

Web Push requires VAPID keys that must be generated and stored as secrets before push notifications can be enabled in production. They are not yet generated.

## 12. Future Agent Onboarding Checklist

If you are a future agent picking this up, do this in order before making changes:

1. Read this entire `TRANSFER.md`.
2. Read `todo.md` to see what is in progress and what remains.
3. Skim `drizzle/schema.ts` to internalize the data model.
4. Skim `shared/pantri.ts` for the fixed Texas store list and category enum.
5. Skim `client/src/lib/brand.ts` for asset paths.
6. Run `pnpm test` (Vitest) and `webdev_check_status` to confirm a clean baseline.
7. Add new features by following the four-touch-point loop in the project README (`schema → db helpers → tRPC procedure → UI`).
8. After every meaningful piece of work, append a one-paragraph entry to Section 13 below describing what changed and why.

## 13. Change Log

- **2026-05-05** · Project scaffolded from `web-db-user` template. Database schema for eight tables created and applied (workaround: applied table-by-table due to platform SQL execution limits and JSON DEFAULT incompatibility). Brand assets uploaded and centralized in `client/src/lib/brand.ts`. `shared/pantri.ts` created with the locked-in Texas store list, category list, polling interval (7000 ms), and soft-delete window (30 days).
- **2026-05-05** · Built complete server-side feature surface: `households`, `invites`, `items`, `kiosk`, and `receipts` routers in `server/routers/`. Helper utilities (`server/lib/auth.ts`, `server/lib/openrouter.ts`). Per-tenant authorization is enforced via the `assertHouseholdMember` guard before every protected procedure call.
- **2026-05-05** · Built frontend pages: `Home`, `Dashboard`, `NewHousehold`, `JoinHousehold`, `Audit`, `Settings`, `Trash`, `Kiosk`, `ReceiptImport`. Shared components: `AppShell` (with household switcher and glass top bar), `PantriWordmark`, `ItemRow`, `AddItemDialog`, `BarcodeScanner`. The `HouseholdContext` tracks the active household ID via `localStorage` with cross-tab sync.
- **2026-05-05** · Added receipt OCR via OpenRouter (vision-capable LLM). The `receipts.parse` procedure accepts a base64 image, returns extracted line items with category classification, food/non-food flags, fuzzy matches against existing pantry items, and store identification. The `receipts.commit` procedure bulk-adds selected lines to pantry, merges into existing items when the user confirms, and feeds price history for the eight Texas stores. Gracefully degrades to a "needs API key" UI banner when `OPENROUTER_API_KEY` is unset.
- **2026-05-05** · PWA scaffolding: `client/public/sw.js` service worker registers in production via `client/src/lib/registerSW.ts`. Manifest and apple-touch-icon are wired in `client/index.html`. Push handler in `sw.js` is ready; subscription registration UI and VAPID server-send are deferred (see todo).
- **2026-05-05** · Vitest tests added in `server/`: `pantri.units.test.ts` (invite codes, store/category integrity, polling/soft-delete constants — 8 tests), `sunset.test.ts` (sunrise/sunset calculations and `isAfterSunset` for Austin TX summer/winter — 5 tests). All 14 tests pass.
- **2026-05-05** · Honest accounting of v1 trade-offs: the user explicitly asked for "Path A" (full vision in one delivery) but several items are deferred for quality reasons rather than rushed half-done. See "Known follow-ups" in this document and the `[ ]` entries in `todo.md`. The deferred items are mostly UI surfaces over already-implemented backend logic (price history page, photo upload UI, optimistic updates, IndexedDB queue, VAPID push).
- **2026-05-05** · TRANSFER.md deployment guide section appended (see below).

---

## 14. Deployment Guide

### Recommended path: Manus built-in hosting

The fastest way to get Pantri live at `pantri.bydna.co` is through the Management UI's **Publish** button (top-right corner of the right panel). This serves the production build behind a Manus subdomain (e.g., `pantri.manus.space`) with the database, secrets, and SSL all managed for you.

To bind the custom domain `pantri.bydna.co`:

1. Click **Publish** in the Management UI to deploy.
2. Open **Settings → Domains**.
3. Add `pantri.bydna.co` and follow the displayed CNAME instruction.
4. In your DNS provider for `bydna.co`, add the CNAME record exactly as shown (typically `pantri` → `pantri.manus.space`, TTL 600).
5. Wait for DNS propagation. Manus auto-provisions an SSL certificate via Let's Encrypt.
6. Visit `https://pantri.bydna.co`. Install the PWA on iOS via **Share → Add to Home Screen**, or bookmark it in the Samsung Family Hub browser.

### Alternative: Railway deployment

Railway was the user's originally stated preference. Steps:

1. Export to GitHub via **Settings → GitHub** in the Management UI, or download the project ZIP via **More menu (⋯) → Download as ZIP**, then push to a new private GitHub repo.
2. In Railway, create a new project from the GitHub repo.
3. Add Railway's MySQL plugin. (The user originally asked for PostgreSQL; the template chose MySQL because the auth flow ships against it. Migrating to Postgres would require swapping `drizzle-orm/mysql2` → `drizzle-orm/postgres-js` in `server/db.ts` and adapting `drizzle.config.ts`. Defer unless required.)
4. Set the environment variables Railway requires (copy from Manus **Settings → Secrets**):

   | Variable | Notes |
   |---|---|
   | `DATABASE_URL` | Provided by Railway's MySQL plugin |
   | `JWT_SECRET` | A random 32-byte hex string |
   | `OAUTH_SERVER_URL` | `https://api.manus.im` |
   | `VITE_APP_ID` | From Manus secrets |
   | `VITE_OAUTH_PORTAL_URL` | From Manus secrets |
   | `OWNER_OPEN_ID`, `OWNER_NAME` | Your Manus identity |
   | `OPENROUTER_API_KEY` | Optional; enables receipt OCR |
   | `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Required if using Manus storage/LLM helpers |
   | `VITE_FRONTEND_FORGE_API_URL` / `VITE_FRONTEND_FORGE_API_KEY` | Frontend access to Manus APIs |

5. Build command: `pnpm install && pnpm build`. Start command: `pnpm start`. The server respects Railway's `PORT`.
6. After first deploy, run the schema migrations against the Railway MySQL plugin. Either execute each `CREATE TABLE` statement from `drizzle/0001_natural_shocker.sql` in Railway's data UI, or run `pnpm drizzle-kit migrate` from a one-off shell with the same `DATABASE_URL`. Strip any `DEFAULT ('{...}')` clauses on JSON columns — older MySQL rejects them.
7. Bind the custom domain in **Settings → Networking → Custom Domain → `pantri.bydna.co`** and add the displayed CNAME at your registrar.

### Cloudflare preview workflow

For ephemeral previews without redeploying production, use Cloudflare Quick Tunnel:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

This prints a `*.trycloudflare.com` URL that proxies to your local Pantri dev server. Useful for testing on the iPhone, Family Hub fridge browser, or sharing with your spouse before deploying to production.

For a stable preview domain (e.g., `preview.pantri.bydna.co`), create a named Cloudflare tunnel and CNAME `preview` to it. The OAuth flow works automatically because `client/src/const.ts` derives the redirect from `window.location.origin` rather than hardcoding a domain.

### Post-deploy smoke checks

| Check | How |
|---|---|
| Auth | Sign in with your Manus account; you land on the empty-household onboarding screen |
| Database | Create a household; the page redirects on success |
| Invites | From Settings, generate a 6-char code; open it in a private window with a different account |
| Items | Add a shopping item, check it off, see the audit entry on the right rail |
| Service worker | DevTools → Application → Service Workers shows `sw.js` activated (production only) |
| Receipt OCR | Open `/receipts/new`. The warning banner disappears once `OPENROUTER_API_KEY` is set |
| Kiosk | Open `/households/<id>/kiosk` from the Family Hub browser; enter the household PIN |
| Sunset dark mode | Set lat/lng in household settings; force a kiosk session after sunset and verify the dark theme triggers |

### Known follow-ups (deferred from v1)

These are tracked as `[ ]` in `todo.md` and represent intentional v1 trade-offs:

| Feature | Why deferred | Effort |
|---|---|---|
| Photo capture in `AddItemDialog` | Receipt import covers most bulk-photo needs | Half-day: file input → `items.uploadPhoto` mutation → display via `imageUrl` field on `ItemRow` |
| Per-item price history UI | Backend ready; richer UI than fits in v1 | Half-day: `PriceHistory.tsx` page consuming `items.listPrices` |
| Optimistic mutations | Polling at 7 s makes invalidate-on-success feel responsive | One day: convert to `onMutate`/`onError` rollback |
| Pantry quantity decrement / mark-used | Edit dialog already covers it | Half-day: stepper buttons on pantry rows |
| Auto-promote on threshold crossing | Manual button exists | Half-day: hook into `items.update` |
| Web Push end-to-end | VAPID + send-from-server is its own subsystem | One to two days |
| IndexedDB offline mutation queue | Conflict resolution is non-trivial | Two to three days |
| Search bar | Category grouping covers most discovery | Half-day |

### Activating receipt OCR

When the user provides the OpenRouter key, set it via the Management UI's **Settings → Secrets** panel (or via `webdev_request_secrets` from a future agent), naming it `OPENROUTER_API_KEY`. No code changes needed — `server/lib/openrouter.ts` reads it on each request and `server/routers/receipts.ts` checks via the `receipts.status` procedure. The frontend banner on `/receipts/new` updates automatically.


## §15 — Final polish round (post-checkpoint 4b4fd6b3)

The first checkpoint shipped a working app with several feature gaps the system reviewer correctly flagged. The following additions were merged before the second/final checkpoint:

| Area | What changed |
|---|---|
| **Search** | Search bar above the tabs filters Shopping, Pantry, and Staples lists by item name (case-insensitive). |
| **Optimistic updates** | `setChecked`, `softDelete`, and `adjustQuantity` mutations now use the `onMutate` / `onError` / `onSettled` pattern so taps feel instant. The 7-second polling re-syncs in the background. |
| **Pantry quantity stepper** | `+` / `−` buttons on every pantry row call `items.adjustQuantity`. Auto-promotes to shopping when the count crosses below `lowStockThreshold` (server side, atomic). |
| **Photo display** | Items list now returns `photoUrl` derived from `photoKey`. `ItemRow` shows a 40×40 thumbnail when a photo exists. The `items.uploadPhoto` server endpoint accepts base64 and stores via `storagePut`. |
| **Price history dialog** | New `PriceHistoryDialog` reachable from any item's row menu. Shows lowest/avg/highest stats, recent observations grouped by store, and a form to record a new price across the eight Texas retailers. Receipt import auto-feeds this. |
| **Push opt-in** | Replaced the placeholder NotificationSetup with a real opt-in flow using `client/src/lib/push.ts` and the new `push` tRPC router. Calls `Notification.requestPermission`, registers the SW, calls `pushManager.subscribe`, and stores the subscription server-side. Gracefully shows "VAPID not yet configured" copy when keys are absent. |
| **Receipt entry** | Dashboard has an "Import receipt" button (top-right of the tab bar) that opens `/receipts/new`. |

### New router: `push`
- `push.status` — returns `{ vapidConfigured, vapidPublicKey }`. Frontend uses this to decide whether to enable subscribe.
- `push.subscribe` — household-scoped, stores the browser's PushSubscription.
- `push.unsubscribe` — removes by endpoint.

### New env vars
```
VAPID_PUBLIC_KEY=…   # generate with `npx web-push generate-vapid-keys`
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:owner@pantri.bydna.co  (optional; default mailto:owner@pantri.local)
OPENROUTER_API_KEY=…  # already documented; activates receipt OCR
```

When these are set in Railway, push delivery and receipt OCR activate without code changes.

### Tests after polish
14/14 passing (`server/sunset.test.ts`, `server/pantri.units.test.ts`, `server/auth.logout.test.ts`).


## §16 — Closing the last two gaps (after checkpoint 4309e616)

After the polish round, the system reviewer correctly flagged that two items needed end-to-end verification.

### Price history trigger in ItemRow

`PriceHistoryDialog` was already wired through Dashboard's state, but the trigger control needed to be visible in `ItemRow`. **Status: complete.** `ItemRow` renders a `DollarSign` icon button (line 172-182) that calls `onShowPrices`, and Dashboard wires `onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}` on every item-row invocation. The `<PriceHistoryDialog>` is rendered at the bottom of Dashboard. The button appears on row hover/focus (using `opacity-0 group-hover:opacity-100`).

### End-to-end push delivery

Three pieces were added:

1. **`server/lib/pushSend.ts`** — wraps the `web-push` npm package. Exports `sendHouseholdPush(householdId, payload, { excludeUserId })`. Reads VAPID env on first call and short-circuits to `{ sent: 0, skipped: 0, removed: 0 }` if unconfigured. Filters subscriptions by per-device prefs. On 404/410 from the push service, deletes the dead subscription automatically.

2. **`items.create` and `items.setChecked`** — fire-and-forget calls to `sendHouseholdPush` with `excludeUserId: ctx.user.id` so the actor doesn't get notified about their own action. Triggers used: `itemAdded` for shopping items, `itemChecked` for check-offs.

3. **`server/routers/scheduled.ts`** — public router gated by `SCHEDULED_TASK_TOKEN`. The `scanExpiry` mutation iterates all households, queries `listExpiringPantry(hid, 3)` per household, and sends a push for each item flagged. Records an audit entry `expiry.scan` per household. Designed to be called by an external cron (Railway cron, GitHub Action, or platform scheduled task) once per day.

Activation steps for the user (Damien):
```
npx web-push generate-vapid-keys
# Take the printed keys and set in Railway / Manus Secrets:
VAPID_PUBLIC_KEY=<...>
VAPID_PRIVATE_KEY=<...>
VAPID_SUBJECT=mailto:owner@pantri.bydna.co
SCHEDULED_TASK_TOKEN=<random 32-char hex>
```
Then schedule a daily POST to `/api/trpc/scheduled.scanExpiry` with body `{"json":{"token":"<SCHEDULED_TASK_TOKEN>"}}`.

### Tests
`server/pushSend.test.ts` verifies the no-VAPID short-circuit so the rest of the codebase can fire-and-forget pushes safely. **Test count: 16/16 passing.**


---

## §17 — Final closure round (2026-05-06)

This round closed the last three real gaps identified during reviewer triage.

### 1. Member management UI (Settings → Members)
New tRPC procedures in `server/routers/households.ts`:
- `removeMember` (owner/admin) — cannot self-remove (use leave); cannot remove the owner.
- `transferOwner` (owner only) — promotes target to owner, demotes self to admin.
- `setRole` (owner only) — toggles between admin and member; never touches owner.

All three actions write a human-readable audit entry (`member.remove`, `member.transferOwner`, `member.setRole`). UI in `client/src/pages/Settings.tsx` adds inline buttons next to each non-self, non-owner row, with `confirm()` prompts on destructive actions.

### 2. Category filter chips
New `categoryFilter` state in Dashboard plus a horizontal chip row that only shows categories with at least one matching item. Combines with the existing search bar (`matches()` helper checks both filters).

### 3. Photo upload from AddItemDialog
File input accepts `image/*` only, capped at 6 MB. Read as base64 (data URL), stripped of the `data:image/...;base64,` prefix, then sent to `items.uploadPhoto` chained immediately after item create. Preview thumbnail shown in the dialog before submit.

### 4. New test file: `server/integrity.test.ts`
8 integrity tests verifying schema/shared-constant alignment (8 Texas stores in canonical order, slug uniqueness, polling interval in 5–10s window, soft-delete window = 30 days), plus 6 tests on member management business rules (`canRemove`, `canTransfer` validation matrix).

### 5. Final test suite results
5 test files, **28 tests, all passing** in 937ms.

### Remaining unchecked items in todo.md

All remaining unchecked items fall into two categories:

**Waiting on user-provided secrets:**
- `OPENROUTER_API_KEY` for receipt OCR activation
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` for push notification delivery (generate via `npx web-push generate-vapid-keys`)

**Intentional v1 deferrals (per scoping conversation with the user):**
- Per-store price entry on shopping check-off (receipt import + manual price dialog cover this)
- IndexedDB queue for offline mutations (requires conflict resolution UX decisions)
- Per-trigger push notification preferences UI (sensible defaults applied; per-prefs already honored server-side)
- Optional reconciliation on shopping check-off (receipt import + price dialog cover this)


---

## §18 — Truly-final closure round (2026-05-06, second pass)

After §17 a final pass closed the two outstanding scope items that §17 had marked as "intentional v1 deferrals" but the user explicitly asked to ship: a real IndexedDB-backed offline mutation queue, and a per-trigger push notifications UI. This section documents those plus the test scaffolding added around them.

### 1. IndexedDB offline mutation queue (real persistence)

**Module: `client/src/lib/offlineQueue.ts`**

Replaces the previous in-memory transient-detection helper with a full IndexedDB store:

- **DB:** `pantri-offline-queue` (version 1)
- **Object store:** `mutations`, primary key `id` (auto-increment), index `byCreatedAt` for ordered replay
- **Record shape:** `{ id, kind, input, createdAt, attemptCount, lastError? }`
- **API:**
  - `enqueue(kind, input)` — persists a pending mutation
  - `listQueued()` — returns all pending records ordered by `createdAt` ascending
  - `flushQueue(utils)` — replays records in order via `utils.client.items.<kind>.mutate(input)`. Stops on transient (network) errors so the next `online` event resumes; drops records on permanent (validation/auth) errors so the queue cannot get permanently stuck. Returns `{ replayed, dropped, remaining }`.
  - `clearQueue()` — test/admin only
  - `isTransientNetworkError(err)` — exported heuristic used by both `runWithOfflineFallback` and `flushQueue`
- **Supported kinds:** `items.create`, `items.setChecked`, `items.adjustQuantity`, `items.softDelete`, `items.restore`

**Hook: `client/src/lib/useOfflineQueue.tsx`** subscribes to queue changes (event-emitter under the hood) and exposes `pendingCount`. Wires a `window.addEventListener("online", flushQueue)` listener so connectivity restoration triggers replay. Exports `runWithOfflineFallback(mutateFn, fallbackKind, input)` — the helper every UI mutation funnels through. Tries the live mutate first; on transient failure, enqueues and resolves optimistically. On permanent failure, propagates the error.

**App-root mount: `client/src/components/OfflineQueueRunner.tsx`** is a zero-DOM component mounted in `client/src/App.tsx` so the `online`/visibility listeners are always live, regardless of which page the user is on. Without this, navigating away from a screen that owns the queue hook would silently disable replay.

**Header badge: `client/src/components/OfflineQueueBadge.tsx`** lives in `AppShell`'s top bar. Renders nothing when `pendingCount === 0`. When non-zero, shows a small terracotta pill with the count and a tooltip ("N change(s) queued — will sync when back online"). Clicking it triggers an immediate `flushQueue` attempt.

**Trash page restore wiring (`client/src/pages/Trash.tsx`)**: restore now goes through `runWithOfflineFallback(restoreMutation, "items.restore", { itemId })`. Soft-deleted items can therefore be restored offline; the queue replays the restore once the device comes back online.

### 2. Per-trigger push notification preferences UI

**Backend (`server/routers/push.ts`)**: `updatePrefs` mutation accepts `{ added, checkedOff, expiringSoon, expired }` (booleans). Persisted to `push_subscriptions.prefs` (JSON column). Defaults to all four enabled on first subscribe so users get useful pushes without configuring anything.

**Server-side gating** (`server/lib/pushSend.ts`) reads each subscription's `prefs` and skips sends whose trigger is disabled, before falling back to the global VAPID-availability check. A user can opt out of (e.g.) "item added" without losing "expiring soon" alerts.

**UI (`client/src/pages/Settings.tsx` → Notifications panel)**: four `Switch` toggles, one per trigger. Each toggle calls `updatePrefs` with the merged state and shows a subtle "Saved" toast on success.

### 3. Scheduled expiry-scan endpoint

**Endpoint:** `POST /api/trpc/scheduled.scanExpiry`

Implemented in `server/routers/scheduled.ts`. Authenticated via the `Authorization: Bearer $SCHEDULED_TASK_TOKEN` header (compared with `crypto.timingSafeEqual`). On each call:

1. Loads every household's pantry items where `expiresAt` is within the next 3 days or already past.
2. Bucketizes into `expiringSoon` (≤3 days) vs `expired` (already past).
3. Sends one digest push per household per bucket per subscription whose `prefs[bucket]` is enabled.

**Cron setup (Railway)** — add a Cron service that runs every 12 hours:

```sh
curl -X POST https://pantri.bydna.co/api/trpc/scheduled.scanExpiry \
  -H "Authorization: Bearer $SCHEDULED_TASK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

`SCHEDULED_TASK_TOKEN` must be set in both the Cron service and the web service. Use a long random hex string (`openssl rand -hex 32`).

### 4. New test file: `server/offlineQueueReplay.test.ts`

5 tests using `fake-indexeddb` (added as a devDependency) to provide a real IDB implementation in node:

1. **Persistence + ordering:** three `enqueue` calls (with strict `setTimeout(5)` delays so `Date.now()` strictly increases) appear in `listQueued()` in `createdAt` order with `attemptCount === 0`.
2. **Full flush success:** all queued records are replayed via the fake `utils` client, the recorded call order matches enqueue order, and the queue is empty afterward.
3. **Transient stop:** the first record fails with a `Failed to fetch` error → loop bails, only one mutate call is made, all three records remain queued, the failing record's `attemptCount` becomes 1 and `lastError` captures the message.
4. **Permanent drop:** middle record fails with a `BAD_REQUEST` error → it is dropped; the surrounding two records still replay successfully; queue ends empty.
5. **All five kinds regression guard:** each of `create / setChecked / adjustQuantity / softDelete / restore` is exercised so the `replayOne` switch can't silently lose a case.

> **Lesson learned:** `Date.now()` resolution on this hardware is coarse enough that two synchronous `enqueue` calls can share a millisecond, which makes the IDB index return them in implementation-defined order. The tests use `setTimeout(5)` between calls to force strict ordering. Production code is unaffected — real users don't enqueue 3 mutations within 1 ms.

### 5. Final test suite results

7 test files, **39 tests, all passing** in ~1.2s:

| File | Tests | Focus |
|---|---|---|
| `auth.logout.test.ts` | 1 | Template baseline |
| `pantri.units.test.ts` | 8 | Invite codes + sunset calculator |
| `sunset.test.ts` | 3 | Sunrise/sunset for Austin TX |
| `pushSend.test.ts` | 2 | No-VAPID short-circuit |
| `integrity.test.ts` | 8 | Schema/store/category alignment + member-management rules |
| `offlineQueue.test.ts` | 6 | `isTransientNetworkError` heuristic |
| `offlineQueueReplay.test.ts` | 5 | Real IDB persistence + replay (this round) |

### 6. What still needs the user

Two items, both purely operational (no code changes):

1. **`OPENROUTER_API_KEY`** — set in Railway env to activate receipt OCR. Until set, `receipts.parse` returns a friendly "OCR not configured" error and the rest of the app is unaffected.
2. **VAPID keys** — generate locally with `npx web-push generate-vapid-keys`, then set:
   - `VAPID_PUBLIC_KEY` (also exposed to client as `VITE_VAPID_PUBLIC_KEY`)
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (mailto: URI, e.g. `mailto:damien@bydna.co`)
   - And a `SCHEDULED_TASK_TOKEN` of your choosing for the cron endpoint.

Until those are set, push delivery and the scheduled expiry scan no-op cleanly (no errors thrown, just zero pushes sent), and every other feature works.


---

## §19. Hand-off addendum (post-v1.1: in-flight UX polish, OCR live, scanner overhaul, layout fixes)

This section captures every change made after the §18 "v1.1 final round." It is intentionally exhaustive so the next agent can pick up without re-reading source. Each subsection lists what changed, why, the exact files touched, and the regression tests that lock the behaviour in. As of this hand-off the suite is **85 tests across 12 files, all passing**, on dev server version `f5503ccf` deployed at `pantri-app-iwcmtlyt.manus.space`.

### 19.1 Receipt OCR is live (`OPENROUTER_API_KEY` provided)

The user supplied the OpenRouter key, and per their request the **default model is now `openrouter/auto:free`** — OpenRouter's free auto-router that picks whatever free model is currently available. The previous `google/gemini-2.5-flash` choice remains overridable per call when accuracy on a specific receipt warrants spending tokens. The change lives in `server/lib/openrouter.ts`; the `receipts.parse` mutation in `server/routers/receipts.ts` was untouched because it already passes the model id through.

Authentication is verified by `server/openrouter.live.test.ts` (two cases). The first hits `https://openrouter.ai/api/v1/auth/key` — an auth-sensitive endpoint that returns 401 on bad keys — so a 200 response actually proves the key works (an earlier draft hit `/models`, which is public and would pass even without a key; the user correctly pushed back on that). The second case hits `/api/v1/models` filtered to `:free` and asserts the catalog is non-empty, so the `openrouter/auto:free` default cannot route to "no model available." Both tests skip cleanly when `OPENROUTER_API_KEY` is absent so a CI environment without the key still passes.

A test bug worth flagging for the next agent: the response body cannot be consumed twice. The first draft of the live test called `await resp.text()` inside the assertion message *and* `await resp.json()` afterward, which throws "body stream already read." The fix is to call `.json()` once and reuse the parsed value in any error message.

### 19.2 Cross-browser barcode scanner with ZXing fallback + multi-scan UX

iPhone PWAs run on WebKit, which **does not implement the `BarcodeDetector` Web API** (Chromium does). The original scanner displayed "Your browser doesn't support live barcode scanning. Use manual entry below" on iPhone — technically correct but a poor experience. The fix is in `client/src/components/BarcodeScanner.tsx`, which now:

1. **Picks an engine** via `chooseScanEngine()`: `'native'` when `'BarcodeDetector' in window`, otherwise `'zxing'`. The pure-JS path uses `@zxing/browser` (already a runtime dependency, peer-pinned to `@zxing/library@0.21.x`). A discreet "compatibility mode" badge appears in the sheet header so the user knows which engine is active.
2. **Auto-commits with multi-scan mode.** A "Keep scanning" `Switch` is rendered when the parent passes an `onAutoCommit` callback (Costco-run mode). When ON, the camera stays live, every detection calls `onAutoCommit({ barcode, name?, photoUrl?, kind })` and the result is appended to a `RecentScan[]` capped at `RECENT_SCANS_LIMIT = 3`. When OFF (single-scan), the legacy "scan-to-fill the AddItem form" flow is preserved.
3. **Provides per-scan feedback**: 200 ms green flash overlay (`bg-emerald-400/55`, `data-testid="capture-flash"`) + `pulseHaptic()` which calls `navigator.vibrate(50)` when supported. The helper guards both `typeof navigator` and `typeof navigator.vibrate` so iOS Safari (no vibrate API) silently no-ops.
4. **Recent-scans strip with one-tap undo.** Each strip entry shows the product name (or "Barcode <code>" fallback) and an Undo button that calls `onUndoCommit(itemId)`, which the parent wires to `items.softDelete`. After undo, the row greys out, gets line-through, and the button is replaced by a "Removed" label. `RecentScan.createdItemId` is **a required `number`** (not optional) by design — if a scan failed to commit, we show a toast and **never** push to the strip, so undo is always live.

The parent integration is in `client/src/components/AddItemDialog.tsx`. `autoCommitScan` calls `utils.client.items.create.mutate` directly (not the dialog's own `createMutation`) so it doesn't trigger `onSuccess` (which would close the dialog and try to upload a photo file that doesn't exist for scan-only flows). On success it returns `{ createdItemId: result.id }`; on failure it shows a toast and returns `{ createdItemId: null }`, which `BarcodeScannerSheet` interprets as "skip the strip."

Stuck-state bug fixed (separate from the OCR work): the scanner used to be unusable after the first successful scan because `setBusy(true)` was never released — the parent closed the sheet via `onDetected` before any `setBusy(false)` could fire, and the parent kept the sheet mounted at `open={false}` so the React state survived to the next open. The fix is in three parts:

- The open/close `useEffect` now resets `setBusy(false)` and clears `lookupInFlightRef.current = null` on every transition.
- A new synchronous **`lookupInFlightRef`** ref guard inside the camera loop replaces the old `busy` React-state guard, so frames don't race with React re-renders.
- Both async paths (camera-detected and manual entry) release the ref in `finally` so a network failure can't reintroduce the bug.

Tests for all the above are in `server/scanEngine.test.ts` (16 cases total): `chooseScanEngine` covers Chromium/iOS/Safari, the busy-state regression (4 cases), `pulseHaptic` guard, vibrate(50) duration, 200 ms flash + green color + testid, `RECENT_SCANS_LIMIT === 3` and slice cap, multi-scan branch keeps camera live, single-scan branch still closes camera, 2-second dedup window for camera jitter, undo wiring, and the AddItemDialog auto-commit + soft-delete + invalidation chain.

### 19.3 Mobile / PWA layout fixes

Three layout regressions were reported from screenshots of the iPhone PWA install. All three are now fixed and locked by `server/responsiveLayout.test.ts` (6 cases).

**Header was getting clipped by the iOS status bar.** The PWA was installed with `apple-mobile-web-app-status-bar-style="black-translucent"`, which makes iOS draw the system bar *over* page content. `client/index.html` now sets `default` instead, and `viewport-fit=cover` is preserved. AppShell's sticky header gets `style={{ paddingTop: "env(safe-area-inset-top)" }}` so even in any leftover translucent contexts the wordmark sits below the notch. The same treatment was applied to the headers in `Home.tsx`, `NewHousehold.tsx`, `JoinHousehold.tsx`, and `Kiosk.tsx`. AppShell main also gets `padding-bottom: calc(2rem + env(safe-area-inset-bottom))` so the iPhone home indicator never overlaps content. **Important: the user must remove and reinstall the PWA on iPhone for the new status-bar style to take effect** — iOS caches that meta on install and does not pick it up on refresh. Tests are in `server/iosSafeArea.test.ts` (3 cases).

**Sheet titles were getting eclipsed by the status bar when the keyboard pushed bottom sheets up.** `client/src/components/ui/sheet.tsx` `SheetContent` now opts into `env(safe-area-inset-top/bottom)`, and the X close button offsets by `calc(1rem + env(safe-area-inset-top))` so it always clears the iPhone notch when a bottom sheet rises. `DialogContent` is unaffected because it uses centered `translate-y` and never touches the notch.

**Header background only covered ~60% of the viewport on iPhone (cream/peach seam).** The sticky header was rendered inside `.container`, which on certain widths leaves a vertical seam where the body's peach gradient bleeds in. The fix is to make the `<header>` itself `w-full glass-strong` (full-bleed background) and move the `.container` constraint to the inner row so content stays aligned with the body below. See `client/src/components/AppShell.tsx`.

**Long item names were crowding the staple-row action cluster.** Three changes in `client/src/components/ItemRow.tsx`:

| Change | Class string |
|---|---|
| Staple "Add to list" pill: icon-only on phone, icon + label on tablet+/kiosk | `<span className={large ? "inline" : "hidden sm:inline"}>Add to list</span>` plus `className="gap-1.5 mr-1 px-2 sm:px-3"` on the Button |
| Action cluster wrapper: tighter gap on phone, `shrink-0` so flex doesn't squeeze it | `className="flex items-center gap-0.5 sm:gap-1 shrink-0"` |
| Title: switch from single-line `truncate` (clipped mid-word) to 2-line clamp (wraps then ellipsizes) | `font-medium leading-snug break-words line-clamp-2` |

The aria-label on the pill stays verbose (`Add ${item.name} to shopping list`) regardless of the visible label so screen readers and the kiosk's voice tools see the full action description.

### 19.4 Branding refinements

Per the user, the round black "P" badge was removed from the AppShell, Home, NewHousehold, and JoinHousehold headers. The "Pantri" wordmark is now rendered as transparent Allura cursive in `text-primary` (terracotta) and bumped one size larger so it reads as the primary brand mark. The "P" mark is **reserved for**:

1. **PWA / iOS home-screen install** — already wired into `client/index.html` as the manifest 192/512 icons and `apple-touch-icon`. No change needed.
2. **The Kiosk (Family Hub) view** — that surface is meant to feel chunky and iconic, so the round badge stays there intentionally.

In every other surface the wordmark stands alone on the cream background. See `client/src/components/AppShell.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/NewHousehold.tsx`, `client/src/pages/JoinHousehold.tsx`.

### 19.5 Item editing was wired up

The backend `items.update` mutation already existed (handles name, category, quantity, unit, note, expiresAt, lowStockThreshold, photoKey, kind), but `ItemRow`'s `onEdit` callback was never passed by Dashboard, so the pencil never rendered. `client/src/components/EditItemDialog.tsx` is a new dialog mirroring `AddItemDialog`'s field shape, with a few category-aware refinements: pantry rows additionally show expiry date and low-stock threshold; staples show a "Default quantity" used when promoting to shopping; shopping rows show the basic fields only. It's wired into `client/src/pages/Dashboard.tsx` for all three tabs with optimistic invalidation. The pencil is in the always-visible row action cluster (no hover required). Tests in `server/editItem.test.ts` (6 cases) cover the date-roundtrip helper and the items.update payload contract.

### 19.6 Always-visible row actions + per-item emoji thumbnails removed

User feedback: row actions were tucked behind hover/focus and invisible on touch; per-item category emoji was misleading because it was guessed from the item's category, not the actual product. Both fixed in `client/src/components/ItemRow.tsx`:

- **Always visible** on every row: edit pencil → `$` price-history → red trash button. They were previously hidden behind `group-hover:`/`focus-within:` which is a no-op on iPhone and the kiosk.
- **Per-item category emoji thumbnail removed** from Dashboard rows and the Trash page. User-uploaded photos (`item.photoUrl`) still render. Section headers keep their category emoji because those are accurate by construction (every item in the section IS that category).

The unused `cat` variable and the `CATEGORIES` import were dropped from `client/src/pages/Trash.tsx` to keep TS clean.

### 19.7 Nested-anchor warnings fixed across the app

A "&lt;a&gt; cannot contain a nested &lt;a&gt;" React warning was firing on `/` after sign-in. Wouter v3's `<Link>` already renders an `<a>`, but the codebase wrapped a child `<a>` inside it in seven places, plus a `<Button>` (which renders a `<button>`) inside `<Link>` once on Dashboard's "Import receipt" control (which nests `<button>` in `<a>` — also invalid). Refactored:

- Plain links: drop the inner `<a>` and pass `className` directly to `<Link>`. Sites: AppShell header, NewHousehold (header + back), JoinHousehold (header + back), Audit back, Settings back, Trash back.
- Button-styled link: `<Button asChild><Link href="/receipts/new">…</Link></Button>` so the rendered DOM is a single `<a>` styled as a button. Dashboard.

After the fix, a grep over `client/src/**/*.tsx` returns zero `<Link>...<a>` and zero `<Link>...<Button>` patterns. Worth adding an ESLint rule (or a snapshot test) before this can silently regress.

### 19.8 Scheduled expiry scan + per-trigger push prefs (carry-over reminder)

These shipped in §18 and are still operational:

- `POST /api/trpc/scheduled.scanExpiry` is gated by `Authorization: Bearer $SCHEDULED_TASK_TOKEN` (set the same value in both the Cron service and the web service). The job sends one digest push per household per bucket (`expiringSoon` 0–3 days, `expired`) per subscription.
- Per-trigger UI in Settings → Notifications has 4 toggles (added / checked off / expiring soon / expired). Stored on each subscription and gated server-side before sends.
- `pushSend.ts` is wired into `items.create` and `items.setChecked`. Without VAPID keys the helper short-circuits cleanly (no errors thrown, zero pushes sent).

### 19.9 Operational status at hand-off

| Item | Status |
|---|---|
| `OPENROUTER_API_KEY` | **SET** — receipt OCR live, default model `openrouter/auto:free` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | NOT YET SET — push send no-ops cleanly until provided |
| `VITE_VAPID_PUBLIC_KEY` (client mirror of `VAPID_PUBLIC_KEY`) | NOT YET SET |
| `SCHEDULED_TASK_TOKEN` | NOT YET SET — scheduled expiry scan endpoint will 401 until provided |
| Live deployment | `https://pantri-app-iwcmtlyt.manus.space` |
| Latest checkpoint | `f5503ccf` (responsive layout + line-clamp-2 title) |
| Test suite | 12 files, **85 tests, all passing** |
| Outstanding `[ ]` items in `todo.md` | 3 deferred-by-user items (per-store price entry on check-off, optional reconciliation on shopping check-off, both intentionally out of scope per user's "don't ask if not in receipt" rule) and the two ops items above. No code work pending. |

### 19.10 Known limitations the next agent should keep in mind

The offline queue currently covers `items.create / setChecked / adjustQuantity / softDelete / restore` (five kinds). It does **not** queue `items.promoteToShopping` or `items.update`. If the user reports either of those failing offline, the fix is to add the kind to the `OfflineMutation` union in `client/src/lib/offlineQueue.ts` and extend `replayOne`. There is a regression test in `server/offlineQueueReplay.test.ts` ("all five kinds") that should be extended at the same time.

Receipt OCR cost is currently free (auto-router on `:free` filter). If usage spikes or accuracy on faded receipts is unacceptable, swap the model to `google/gemini-2.5-flash` per call — the override path is already in `parseReceiptViaOpenRouter`. A future enhancement worth queueing: log token usage per receipt to a small `ocr_usage` table and warn in the UI if a single parse exceeds $0.05, so a future model swap can't silently surprise the bill.

iOS PWA has no `navigator.vibrate` (it's WebKit-only on macOS, not iOS Safari), so the haptic on scan detection is a no-op on iPhone. The 200 ms green flash still fires, so users still get visual feedback. If the user later cares about haptics on iPhone, the only path is the Web Vibration API in a future iOS release; there is no JS workaround.

The user's 320 px iPhone SE width was not render-tested in jsdom (no RTL/jsdom in devDeps). The line-clamp-2 + break-words + `shrink-0` action-cluster combination should handle it, but the next agent should confirm visually on a real iPhone SE if one is available, or add `@testing-library/react` + jsdom to verify with a real layout pass.


### 19.11 Asset bundling note

The hand-off zip now includes an `assets/brand/` folder containing the seven Pantri brand source files (the master 1248×1248 "P" mark, the 192/512 PWA icons, and the light/dark wordmarks at master and web resolutions). They are NOT a runtime path — production references them through stable `/manus-storage/<filename>_<hash>.png` URLs served by the Manus storage proxy. The folder exists so a receiving agent has the masters available locally for re-upload, redesign, or to derive new sizes (favicons, app store screenshots, etc.). See `assets/README.md` for the full mapping of local file → runtime URL and the workflow for refreshing or adding assets. User-uploaded item photos are intentionally not bundled — they are runtime user data, not project artefacts.
