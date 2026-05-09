# Pantri TODO

## Foundations
- [x] Database schema: households, household_members, invites, items, item_prices, audit_log, push_subscriptions, household_settings
- [x] Generate and apply Drizzle migration
- [x] Server query helpers in server/db.ts
- [x] tRPC routers split per feature (households, items, prices, audit, invites, kiosk, push, receipts)
- [x] Theme tokens in index.css (cream/espresso/terracotta/olive, Fraunces + Inter)
- [x] Logo wordmark + app icon assets uploaded and wired
- [x] PWA manifest with icons, theme colors, name "Pantri"

## Households & Members
- [x] Create household
- [x] List households for current user
- [x] Switch active household (persisted in localStorage)
- [x] Members list (only same-household visibility)
- [x] Roles: owner, admin, member
- [x] Leave household
- [x] Owner can transfer ownership, change roles (admin↔member), and remove non-owner members (UI in Settings → Members)

## Invites
- [x] Email invite link (frontend passes origin)
- [x] Shareable 6-character invite code (e.g., 7K9X2P)
- [x] QR code generation for invite
- [x] Accept invite flow (signed-in users only)
- [x] Invite expiry and single-use options

## Shopping List
- [x] Add item with name, category, qty, note
- [x] Check off item (with audit entry)
- [x] Edit / delete (soft delete)
- [x] Filter by category (chip row above list; only categories with items are shown)
- [x] "Recurring / staple" flag → quick re-add
- [x] Per-store price entry (via receipt import)
- [x] Price history UI per item (PriceHistoryDialog with stats + add-price form)
- [x] Search bar (filters Shopping/Pantry/Staples)
- [~] Per-store price entry on check-off — DEFERRED by user during scoping; PriceHistoryDialog + receipt import cover the use case

## Pantry Inventory
- [x] Add pantry item with quantity and expiry date
- [x] Decrement / restock quantity (−/+ stepper on every pantry row)
- [x] Manual promote to shopping list (one-tap from pantry/staples)
- [x] Auto-promote on threshold crossing (server-side, atomic with quantity adjust)
- [x] Expiring soon highlight (≤3 days)
- [x] Expired highlight
- [x] Categories matching shopping list

## Barcode & Photos
- [x] Barcode scanner via getUserMedia + BarcodeDetector
- [x] Open Food Facts lookup on barcode
- [x] Manual entry fallback
- [x] Photo upload server endpoint to S3-compatible storage
- [x] Photo display on item card (40×40 thumbnail when present)
- [x] Photo upload from AddItemDialog UI (camera capture or photo picker, 6 MB cap, base64 chained upload after item create)

## Audit Log
- [x] Record events: item.add, item.check, item.edit, item.delete, item.restore, member.join, member.leave, kiosk.access, receipt.import
- [x] Per-household feed view
- [x] Human-readable strings ("Sarah added Eggs at 3:42 PM")

## Soft Delete
- [x] deletedAt column on items
- [x] Filter deleted from default queries
- [x] "Recently deleted" view
- [x] Restore action
- [x] Hard purge after 30 days (query-time filter via SOFT_DELETE_DAYS)

## Kiosk / Family Hub Mode
- [x] Household 4-digit PIN
- [x] Configurable permissions: view, add, check off, edit, delete
- [x] Kiosk session (localStorage on the device)
- [x] Large-touch-target layout for fridge
- [x] Sunset-based auto dark mode (lat/lng)

## Offline & Realtime
- [x] Service worker with cache-first for shell
- [x] 5–10 second polling on active views
- [x] Optimistic UI for check/uncheck/delete/quantity-adjust
- [x] IndexedDB queue for offline mutations (transient-error detection → IDB persist → replay on online; covers create/setChecked/adjustQuantity/softDelete/restore; OfflineQueueBadge in AppShell)

## Push Notifications
- [x] Service worker push handler ready (sw.js)
- [x] Client-side web push subscription registration UI (Settings → Notifications)
- [x] Server-side push send wired into create + check-off events (graceful no-op without VAPID)
- [x] Scheduled expiry scan endpoint (POST /api/trpc/scheduled.scanExpiry, gated by SCHEDULED_TASK_TOKEN)
- [x] pushSend test verifying no-VAPID short-circuit
- [~] VAPID keys — WAITING ON USER; run `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT at deployment. Server-side push send is fully wired and no-ops cleanly until keys are present.
- [x] Per-trigger user preferences UI (Settings → Notifications: 4 toggles for added/checkedOff/expiringSoon/expired; persisted server-side per device)

## Receipt OCR import
- [x] Add server/lib/openrouter.ts with multimodal LLM call wrapper
- [x] tRPC procedure receipts.parse: accepts image, returns extracted line items + store guess + total + fuzzy matches
- [x] tRPC procedure receipts.commit: bulk-add selected lines, record prices, fuzzy-merge existing items
- [x] ReceiptImport.tsx page with photo capture/upload, review (food pre-checked), fuzzy-match confirmations, store override
- [x] Auto-feed price history for the 8 Texas stores when committing receipt items
- [x] Receipt import quick action from Dashboard
- [~] Activate by setting OPENROUTER_API_KEY — WAITING ON USER. Receipt OCR is fully scaffolded; setting the key at deploy time activates it without code changes.
- [~] Optional reconciliation on shopping check-off — DEFERRED by user during scoping ("don't ask if not in receipt"); receipt import + PriceHistoryDialog cover this

## Polish & Accessibility
- [x] Warm-tactile palette + glassmorphism panels
- [x] Fraunces headings, Inter body
- [x] Pantri cursive wordmark in header
- [x] Light + dark mode (manual switchable)
- [x] Fridge layout with large hit targets in Kiosk page
- [x] Empty states with character
- [x] Focus states + keyboard nav

## Tests
- [x] auth.logout.test.ts (template baseline)
- [x] pantri.units.test.ts (invite codes, store/category integrity, polling/soft-delete constants)
- [x] sunset.test.ts (sunrise/sunset and isAfterSunset for Austin TX)
- [x] pushSend.test.ts (no-VAPID short-circuit returns zero counts)
- [x] integrity.test.ts (8 tests on schema/store/category alignment + member management business rules)
- [x] offlineQueue.test.ts (6 tests on isTransientNetworkError heuristic, including navigator.onLine override)
- [x] All 34 tests passing across 6 test files
- [x] offlineQueueReplay.test.ts (5 IDB persistence + replay tests using fake-indexeddb: createdAt order, full flush, transient-error stop, permanent-error drop, all 5 kinds)
- [x] All 39 tests passing across 7 test files (final)

## Documentation
- [x] TRANSFER.md seeded and updated through development
- [x] Document Railway deployment for pantri.bydna.co (in TRANSFER.md §14)
- [x] Cloudflare preview workflow (in TRANSFER.md §14)

## Deployment
- [x] Save checkpoint 4b4fd6b3 (initial v1)
- [x] Save checkpoint 4309e616 (post-polish)
- [x] Save checkpoint befdc35d (member management + filter chips + photo upload)
- [x] Save final checkpoint after IndexedDB offline queue + per-trigger push UI (saved as 6fbb79e4)
- [x] Auto-domain assigned: pantri-app-iwcmtlyt.manus.space
- [x] Owner can transfer/remove members UI — done
- [x] Category filter chips on Dashboard — done
- [x] Photo upload from AddItemDialog — done

## Post-v1 follow-ups
- [x] Staples "Add to list" action: always-visible primary pill with explicit label on staple cards; pantry rows get an always-visible outline icon button so promote works on touch without hover
- [x] EditItemDialog: dialog wired into Dashboard for shopping / pantry / staples (name, category, quantity, unit, note, expiry, low-stock threshold). Pencil button on every row opens it. Backed by 6 new tests in server/editItem.test.ts covering date helpers + payload-contract integrity. 45 total tests, all passing.
- [x] Always-visible delete button on every item row (touch-discoverable on mobile)
- [x] Remove per-item category emoji thumbnail from rows (kept on real photoUrl items and on category section headers, since header emojis are accurate by construction)
- [x] Always-visible price-history button in row action cluster (touch-discoverable)
- [x] Header: removed round "P" badge from AppShell, Home, NewHousehold, JoinHousehold; enlarged transparent Allura cursive wordmark in terracotta (text-primary). Kiosk view keeps the round mark intentionally (Family Hub display calls for the iconic badge)
- [x] PWA "P" icon: already wired to manifest 192/512 + apple-touch-icon in client/index.html (no change needed). The round mark is now reserved for the PWA/home-screen install AND the Kiosk (Family Hub) view, where the iconic badge is wanted intentionally; it no longer appears in the standard mobile/web headers
- [x] Switch OpenRouter default model to free auto-router (openrouter/auto:free) so receipt OCR runs at $0; gemini-2.5-flash still overridable per call
- [x] Live vitest verifying OPENROUTER_API_KEY authenticates: GETs https://openrouter.ai/api/v1/auth/key (auth-sensitive endpoint that returns 401 on bad keys) and asserts the bound-key payload comes back; second test confirms free-tier catalog is non-empty so the openrouter/auto:free default has somewhere to route. Both skip cleanly when key absent. 47/47 tests pass.
- [x] Bug: nested-anchor warning fixed. Refactored 7 sites: AppShell header, NewHousehold (header + back), JoinHousehold (header + back), Audit back link, Settings back link, Trash back link — all drop the inner &lt;a&gt; and pass className to wouter Link directly. Dashboard "Import receipt" Button-in-Link converted to Button asChild + Link so the rendered DOM is a single &lt;a&gt; styled as a button (no &lt;button&gt; nested in &lt;a&gt;). Grep verifies zero remaining offenders. 47/47 tests still pass.
- [x] iOS PWA notch overlap fixed. Switched apple-mobile-web-app-status-bar-style from "black-translucent" to "default" so iOS reserves space for its status bar above app content; viewport-fit=cover already in place. Added env(safe-area-inset-top) padding to AppShell sticky header, Home/NewHousehold/JoinHousehold/Kiosk top headers, and env(safe-area-inset-bottom) to AppShell main + NoHouseholdLanding so the iPhone home indicator never overlaps content. Backed by server/iosSafeArea.test.ts (3 regression tests). 50/50 tests pass.
- [x] Modal/sheet safe-area: shadcn SheetContent now opts into env(safe-area-inset-top/bottom) on every variant, and the X close button offsets by calc(1rem + env(safe-area-inset-top)) so it always clears the iPhone notch when the keyboard pushes a bottom sheet up. (DialogContent uses centered translate-y so it stays unaffected.)
- [x] iPhone PWA barcode scanning: chooseScanEngine() picks 'native' when Chromium-based BarcodeDetector is available, falls back to @zxing/browser pure-JS decoder for iOS Safari / iOS PWAs (where BarcodeDetector is unimplemented). UI shows a discreet 'Live scanning (compatibility mode)' badge so users know they're on the JS path. 6 new tests in server/scanEngine.test.ts. 56/56 tests pass.
- [x] Bug fixed: BarcodeScanner stuck on "Looking up...". Root cause: setBusy(true) on first scan was never released because the parent typically closes the sheet via onDetected before any setBusy(false) could fire, and the parent kept the sheet mounted at open={false}, so the React state survived to the next open. Fix: (a) the open/close effect now resets setBusy(false) and clears the in-flight ref on every transition, (b) handleDetected/submitManual use a synchronous lookupInFlightRef ref guard instead of the busy state to avoid race conditions between camera frames, (c) both async paths release the ref in finally so a network failure can't reintroduce the bug. 4 new regression tests in server/scanEngine.test.ts. 60/60 tests pass.
- [x] Scanner UX: "Keep scanning" toggle (only visible when the parent provides onAutoCommit). When ON, BarcodeScannerSheet auto-commits each scan via items.create through the parent's autoCommitScan callback and stays open. Camera is NOT stopped between scans. Single-scan path (used when toggle OFF) is unchanged so AddItemDialog's existing pre-fill flow still works.
- [x] Scanner UX: 200 ms green-flash overlay (bg-emerald-400/55, data-testid="capture-flash") + pulseHaptic() helper that calls navigator.vibrate(50) when supported. Helper guards typeof navigator + typeof navigator.vibrate so iOS Safari (which has no vibrate API) silently no-ops without breaking the flash path.
- [x] Scanner UX: Last-3-scans strip below the toggle (RECENT_SCANS_LIMIT=3). Each entry shows the product name (or "Barcode <code>" fallback) and an Undo button that calls onUndoCommit(itemId) → items.softDelete. After undo the row is greyed + line-through and a 'Removed' label replaces the button. AddItemDialog wires both callbacks; new mutation autoCommitScan calls utils.client.items.create.mutate so it doesn't trigger the dialog's own onSuccess hook (which would close the dialog and try to upload a non-existent photo).
- [x] 8 new vitest cases covering: optional prop typing, pulseHaptic guard, vibrate(50) duration, 200 ms flash + green color + testid, RECENT_SCANS_LIMIT=3 + slice cap, multi-scan branch keeps camera live, default branch still closes camera, 2-second dedup window for camera jitter, Undo wiring, AddItemDialog auto-commit + soft-delete + invalidation. 72/72 tests pass.
- [x] Layout bug fixed: AppShell header is now full-bleed (`w-full` on the sticky <header>; `.container` only constrains the inner row). Glass background paints edge-to-edge on every viewport, so the iPhone PWA seam between header and body's peach gradient is gone. env(safe-area-inset-top) preserved.
- [x] Responsive ItemRow (verified): staple Add-to-list pill label wrapped in `hidden sm:inline` so it collapses to cart-icon-only on phone, restores icon + label at sm and on the kiosk `large` variant. Pill horizontal padding tightens to px-2 on phone / px-3 on tablet+. Action cluster wrapper uses `shrink-0 gap-0.5 sm:gap-1` so it never gets compressed by a long item name. aria-label kept verbose for screen readers/voice tools. 4 new source-invariant regression tests in server/responsiveLayout.test.ts.
- [x] Resolved: switched ItemRow title from single-line `truncate` to `line-clamp-2 break-words leading-snug`. Long product names ("Bunny Grahams Chocolate", "Barcode 893607001125") now wrap to a second line on phone widths instead of being clipped mid-word. line-clamp-2 still ellipsizes anything beyond two lines so a row never grows unboundedly tall. break-words handles the no-space barcode-fallback case. 2 new source-invariant tests in server/responsiveLayout.test.ts (line-clamp-2 + break-words present; combination preserved). 85/85 tests pass.
