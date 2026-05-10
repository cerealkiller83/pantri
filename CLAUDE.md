# Pantri — Project Memory

## What is Pantri?
A household shopping list + pantry inventory PWA. Supports shared households, item tracking across shopping/pantry/staple lists, price tracking, photo uploads, push notifications, receipt OCR via OpenRouter, and expiration alerts.

## Live URL
https://pantri.bydna.co

## Tech Stack
- **Frontend:** React 19 + TypeScript, Vite 7, Wouter (routing), TanStack Query via tRPC, Tailwind CSS + shadcn/ui
- **Backend:** Express 4 + tRPC 11, Drizzle ORM, MySQL
- **Auth:** Email magic link via Resend (JWT sessions using `jose`)
- **Storage:** Cloudflare R2 via `@aws-sdk/client-s3`
- **Push:** Web Push (VAPID keys)
- **PWA:** Service worker, manifest.webmanifest
- **Node version:** 22 (required — uses `import.meta.dirname`)

## Hosting & Services

### Railway (hosting)
- **Dashboard:** https://railway.app (user's account)
- **Service:** Pantri app (Nixpacks builder)
- **Database:** Railway MySQL plugin (same project)
- **Public MySQL URL:** `mysql://root:RKZCkqymaWsimuZacnkPfAzYclaTfRCE@interchange.proxy.rlwy.net:35264/railway`
- **Internal MySQL URL:** `mysql://root:RKZCkqymaWsimuZacnkPfAzYclaTfRCE@mysql.railway.internal:3306/railway`
- **Custom domain:** pantri.bydna.co → rpm3lgjv.up.railway.app (CNAME in Cloudflare DNS)
- **Build:** `pnpm install && pnpm build`
- **Start:** `pnpm start`
- **Health check:** `/api/trpc/system.health?input=%7B%22json%22%3A%7B%22timestamp%22%3A0%7D%7D`
- **Auto-deploy:** pushes to `main` on GitHub trigger redeploy

### GitHub
- **Repo:** https://github.com/cerealkiller83/pantri.git
- **Username:** cerealkiller83
- **Branch:** main
- **Note:** User's PAT was exposed in conversation — should be revoked and regenerated

### Cloudflare R2 (image storage)
- **Bucket name:** pantri
- **Usage:** Item photos uploaded via `items.uploadPhoto` tRPC mutation
- **Keys stored in:** Railway env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)
- **Photo URL pattern:** `${R2_PUBLIC_URL}/pantri/h${householdId}/i${itemId}.${ext}`

### Resend (email)
- **From address:** pantri@bydna.co (or whatever RESEND_FROM_EMAIL is set to)
- **DNS status (as of May 2025):** DKIM verified, MX/SPF were pending propagation
- **Dev fallback:** When Resend isn't configured or email fails, magic link URL is logged to console/Railway logs

### DNS (Cloudflare)
- Domain: bydna.co (managed in Cloudflare)
- CNAME: `pantri` → `rpm3lgjv.up.railway.app`
- Resend DNS records: DKIM, MX, SPF for sending from bydna.co

## Environment Variables (Railway)

| Variable | Purpose |
|---|---|
| NODE_ENV | `production` |
| JWT_SECRET | Signs session cookies |
| DATABASE_URL | Railway MySQL connection string |
| RESEND_API_KEY | Resend email service |
| RESEND_FROM_EMAIL | Sender address for magic links |
| APP_URL | `https://pantri.bydna.co` |
| R2_ACCOUNT_ID | Cloudflare account ID |
| R2_ACCESS_KEY_ID | R2 API token key |
| R2_SECRET_ACCESS_KEY | R2 API token secret |
| R2_BUCKET_NAME | `pantri` |
| R2_PUBLIC_URL | Public R2 URL (e.g. `https://pub-xxx.r2.dev`) |
| OPENROUTER_API_KEY | Receipt OCR AI |
| VAPID_PUBLIC_KEY | Web Push (generate with `npx web-push generate-vapid-keys`) |
| VAPID_PRIVATE_KEY | Web Push |
| VITE_VAPID_PUBLIC_KEY | Same as VAPID_PUBLIC_KEY (client-side) |
| VAPID_SUBJECT | `mailto:damien@bydna.co` |
| SCHEDULED_TASK_TOKEN | Cron job auth token |

## Key Directories & Files
```
pantri-handoff/
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.tsx          # Routes (wouter)
│   │   ├── main.tsx         # Entry point
│   │   ├── const.ts         # LOGIN_PATH, constants
│   │   ├── pages/           # Home, Login, JoinHousehold, etc.
│   │   ├── components/      # UI components
│   │   ├── _core/hooks/     # useAuth, useTrpc
│   │   └── lib/             # brand.ts, utils
│   ├── public/
│   │   ├── brand/           # Static brand PNGs
│   │   ├── manifest.webmanifest
│   │   └── sw.js            # Service worker
│   └── index.html
├── server/                  # Express + tRPC backend
│   ├── _core/
│   │   ├── index.ts         # Express app setup
│   │   ├── env.ts           # ENV config object
│   │   ├── sdk.ts           # JWT session (createSessionToken, verifySession, authenticateRequest)
│   │   ├── oauth.ts         # Magic link routes (POST request-login, GET verify)
│   │   ├── trpc.ts          # tRPC init, protectedProcedure
│   │   ├── systemRouter.ts  # health check
│   │   └── storageProxy.ts  # /manus-storage/* → R2 redirect
│   ├── routers/
│   │   ├── items.ts         # CRUD for items (shopping/pantry/staple)
│   │   ├── households.ts    # Household management
│   │   ├── auth.ts          # me, logout
│   │   └── ...
│   ├── storage.ts           # R2 put/get/signedUrl
│   ├── db.ts                # Drizzle queries + magic link helpers
│   └── lib/                 # pushSend, auth helpers
├── shared/                  # Shared types/constants (pantri.ts)
├── drizzle/                 # Migrations + schema
│   ├── schema.ts            # All table definitions
│   ├── 0000_*.sql           # Initial migration
│   ├── 0001_*.sql           # Second migration
│   └── 0002_regular_morlocks.sql  # magic_link_tokens table
├── vite.config.ts
├── package.json
├── railway.toml
├── .env.example
├── .node-version            # 22
└── tsconfig*.json
```

## Database Tables
1. users
2. households
3. household_members
4. items (shopping/pantry/staple with soft-delete)
5. item_prices
6. audit_log
7. push_subscriptions
8. invite_links
9. magic_link_tokens

## Common Tasks

### Deploy changes
```bash
git add <files> && git commit -m "description" && git push origin main
# Railway auto-deploys from main
```

### Run migrations
```bash
DATABASE_URL="mysql://root:RKZCkqymaWsimuZacnkPfAzYclaTfRCE@interchange.proxy.rlwy.net:35264/railway" pnpm drizzle-kit migrate
```

### Generate a new migration
```bash
pnpm drizzle-kit generate
```

### Local dev
```bash
pnpm install
pnpm dev  # starts Vite dev server + Express backend
```

### Build
```bash
pnpm build  # Vite builds client, tsc builds server
pnpm start  # runs production server
```

## Auth Flow
1. User visits `/login`, enters email
2. POST `/api/auth/request-login` → server creates token (15-min TTL), sends email via Resend
3. User clicks link → GET `/api/auth/verify?token=xxx`
4. Server verifies token, creates/finds user by email, mints JWT cookie, redirects to app
5. Dev fallback: if Resend fails, magic link URL printed to console logs

## Pending Items (as of May 2025)
- VAPID keys not yet generated (push notifications disabled until set)
- Resend MX/SPF DNS may still be propagating
- GitHub PAT should be revoked and regenerated
