# Pantri Brand Assets

This `assets/` folder is **bundled into the hand-off zip but is NOT a runtime path**. It exists so the receiving agent has every brand asset locally, organized, with the full-resolution masters that were uploaded to the Manus storage proxy during development.

## Directory: `assets/brand/`

| File | In `assets/brand/` | Dimensions | Purpose | Served at runtime as |
|---|---|---|---|---|
| `icon_p_from_wordmark_v1.png` | yes | 1248 × 1248 | Master "P" mark, cropped from the wordmark | (master only — used to derive 192/512) |
| `pantri_icon_192.png` | yes | 192 × 192 | PWA manifest icon (small) | `/manus-storage/pantri_icon_192_36467323.png` |
| `pantri_icon_512.png` | yes | 512 × 512 | PWA manifest icon (large) + Apple touch icon | `/manus-storage/pantri_icon_512_02fefb07.png` |
| `pantri_logo_light_web.png` | yes | 1280 × 720 | Web-resolution wordmark for light backgrounds | `/manus-storage/pantri_logo_light_web_dfba11ff.png` |
| `pantri_logo_dark_web.png` | yes | 1280 × 720 | Web-resolution wordmark for dark backgrounds | `/manus-storage/pantri_logo_dark_web_b74635b9.png` |
| `pantri_logo_light.png` | **no** (zip-only, see below) | 2560 × 1440 | Master wordmark for light/cream backgrounds | (master only) |
| `pantri_logo_dark.png` | **no** (zip-only, see below) | 2560 × 1440 | Master wordmark for dark backgrounds (cream ink) | (master only) |

### Note on the 2 MB masters

The two 2.3 MB / 2.1 MB master wordmarks (`pantri_logo_light.png` and `pantri_logo_dark.png`) live OUTSIDE the project tree at `/home/ubuntu/webdev-static-assets/pantri/` — Manus's deployment guard rejects any file >1 MB inside the project tree because it would slow the production deploy without benefiting users (the production app uses the web-resolution copies, not the masters). They ARE bundled into the hand-off zip under `assets/brand/` so the receiving agent has them locally; they're just not part of the live project tree.

## How runtime references work

Production uses **none of these local files directly**. Per Manus webdev policy, all binary assets are uploaded to S3 via `manus-upload-file --webdev` and served through the Manus storage proxy at stable `/manus-storage/<filename>_<hash>.png` URLs. Those URLs share the deployment lifecycle and never expire.

So when you grep the source for asset references you'll find the proxy paths above, not relative paths like `./assets/...`. If a receiving agent needs to:

- **Refresh an existing asset** — replace the master in `assets/brand/`, re-upload via `manus-upload-file --webdev`, then update the URL in `client/src/lib/brand.ts` (or wherever it's referenced) with the new hash returned by the upload command.
- **Add a new asset** — drop the source file in `assets/brand/`, run `manus-upload-file --webdev`, and reference the returned URL from React/HTML. Do not store new assets in `client/public/` or `client/src/assets/` — that path causes deployment timeouts (see template README).
- **Run the project locally without internet** — the manus-storage proxy still resolves these URLs from the platform's S3, so local dev pulls them on first paint. There is no local-only fallback by design.

## Where the runtime actually consumes them

- `client/src/components/PantriMark.tsx` and `PantriWordmark.tsx` reference the proxy URLs above.
- `client/index.html` `<link rel="apple-touch-icon" href="/manus-storage/pantri_icon_512_02fefb07.png">`
- `client/public/manifest.webmanifest` `icons` array — sized 192 and 512.
- `client/src/lib/brand.ts` — single source of truth for these URL constants; refactor any new logo additions through this module.

## Note on uploaded user photos

Item photos (when a user takes a photo from `AddItemDialog`) are stored separately under each user's storage prefix and are NOT bundled into this zip — they are runtime user data, not brand assets, and live in the production Manus storage tied to the deployed app.
