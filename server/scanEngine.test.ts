import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chooseScanEngine } from "../client/src/components/BarcodeScanner";

/**
 * Barcode scanner engine selection.
 *
 * The PWA on iPhone runs under WebKit, which (as of iOS 18) does not
 * implement the `BarcodeDetector` API. Without a fallback, opening the
 * scan sheet produces the message "Your browser doesn't support live
 * barcode scanning" — which is what triggered this work.
 *
 * `chooseScanEngine` picks "native" when BarcodeDetector is available
 * (Chromium-based desktop and Android) and "zxing" otherwise (Safari,
 * iOS PWAs, Firefox). These tests guard against accidental regressions
 * to the detection logic and the fallback choice.
 */
describe("chooseScanEngine", () => {
  it("returns 'native' when BarcodeDetector is implemented as a constructor", () => {
    const win = { BarcodeDetector: class {} };
    expect(chooseScanEngine(win as unknown as Window)).toBe("native");
  });

  it("returns 'zxing' when BarcodeDetector is missing entirely (iOS Safari / iOS PWA)", () => {
    const win = {};
    expect(chooseScanEngine(win as unknown as Window)).toBe("zxing");
  });

  it("returns 'zxing' when BarcodeDetector key exists but is not a function (defensive)", () => {
    const win = { BarcodeDetector: "stub" };
    expect(chooseScanEngine(win as unknown as Window)).toBe("zxing");
  });
});

/**
 * Sheet safe-area regression: BarcodeScanner uses a bottom-side sheet,
 * so when the iPhone keyboard pushes it up, the sheet's title was getting
 * eclipsed by the status bar / notch. The shadcn SheetContent now opts
 * into env(safe-area-inset-top/bottom) padding for every variant.
 */
describe("Sheet component safe-area treatment", () => {
  const root = resolve(__dirname, "..");
  const sheet = readFileSync(resolve(root, "client/src/components/ui/sheet.tsx"), "utf8");

  it("SheetContent pads top and bottom by safe-area-inset", () => {
    expect(sheet).toMatch(/env\(safe-area-inset-top\)/);
    expect(sheet).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("SheetPrimitive.Close offset includes safe-area-inset-top so the X icon clears the notch", () => {
    expect(sheet).toMatch(/calc\(1rem \+ env\(safe-area-inset-top\)\)/);
  });
});

/**
 * The new dependency must be present in package.json so production
 * builds don't fall back to the broken-on-iOS native-only path.
 */
describe("ZXing dependency wiring", () => {
  it("@zxing/browser and @zxing/library are pinned in package.json dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "..", "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@zxing/browser"]).toBeTruthy();
    expect(pkg.dependencies?.["@zxing/library"]).toBeTruthy();
  });
});


/**
 * Regression for the "Looking up..." stuck-state bug.
 *
 * The bug: `setBusy(true)` was called when a scan succeeded, but never
 * released, because the parent typically closes the sheet via the
 * onDetected callback before any setBusy(false) could run. With the
 * sheet kept mounted at open={false}, the React state survived, and on
 * the next open the manual "Look up" button stayed disabled forever.
 *
 * The fix has two halves: (a) the open/close effect must reset busy
 * (and clear the in-flight ref) on every transition, and (b) the
 * dedup decision in handleDetected/submitManual must use the ref
 * (synchronous), not the state (scheduled), to avoid races between
 * camera frames. This regression test reads the source to assert both
 * halves are present, since spinning up jsdom + React for a full
 * component test would be heavier than necessary.
 */
describe("BarcodeScanner busy/in-flight regression", () => {
  const root = resolve(__dirname, "..");
  const src = readFileSync(
    resolve(root, "client/src/components/BarcodeScanner.tsx"),
    "utf8"
  );

  it("declares a synchronous lookupInFlightRef guard", () => {
    expect(src).toMatch(/lookupInFlightRef\s*=\s*useRef<boolean>\(false\)/);
  });

  it("resets busy and the in-flight ref when the sheet opens AND when it closes", () => {
    // The open path resets both flags so a second open starts clean.
    expect(src).toMatch(/setBusy\(false\);\s*\n\s*lookupInFlightRef\.current\s*=\s*false;[\s\S]*?const chosen = chooseScanEngine/);
    // The close path also resets both, so a sheet that was kept at
    // open={false} doesn't carry the stuck-busy state to its next open.
    expect(src).toMatch(/stopCamera\(\);[\s\S]*?setBusy\(false\);[\s\S]*?lookupInFlightRef\.current\s*=\s*false;[\s\S]*?return;/);
  });

  it("handleDetected and submitManual always release lookupInFlightRef in finally", () => {
    // Both async paths must release the ref no matter what — otherwise
    // a network failure on the OFF lookup would re-introduce the
    // stuck-state bug.
    const finallyReleases = src.match(/finally\s*\{[\s\S]*?lookupInFlightRef\.current\s*=\s*false;[\s\S]*?setBusy\(false\);[\s\S]*?\}/g);
    expect(finallyReleases?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("the camera tick loop checks the ref (not the state) for the busy guard", () => {
    // Using the React state here was the original race-window:
    // multiple camera frames could observe busy=false between calling
    // setBusy(true) and React applying it.
    expect(src).toMatch(/lookupInFlightRef\.current\)\s*\{\s*\n\s*rafRef\.current\s*=\s*requestAnimationFrame\(tickNative\)/);
  });
});


/**
 * Multi-scan / Costco-run mode.
 *
 * When the user flips the "Keep scanning" toggle and the parent has
 * provided `onAutoCommit`, the sheet must:
 *   - stay open after each detection (do NOT call stopCamera)
 *   - call onAutoCommit with the OFF lookup result and capture the
 *     returned itemId
 *   - push the scan onto a Last-N strip with that itemId
 *   - dedupe identical barcodes within a short window so camera jitter
 *     doesn't double-add
 *   - leave the single-scan path (onDetected + close) untouched when
 *     keepScanning is OFF or onAutoCommit is undefined
 */
describe("BarcodeScanner multi-scan + feedback wiring", () => {
  const root = resolve(__dirname, "..");
  const src = readFileSync(
    resolve(root, "client/src/components/BarcodeScanner.tsx"),
    "utf8",
  );

  it("declares the optional onAutoCommit and onUndoCommit props", () => {
    expect(src).toMatch(/onAutoCommit\?:\s*\(result:\s*BarcodeResult\)\s*=>\s*Promise<number\s*\|\s*null>/);
    expect(src).toMatch(/onUndoCommit\?:\s*\(itemId:\s*number\)\s*=>\s*Promise<void>/);
  });

  it("exports a haptic helper that no-ops gracefully when navigator.vibrate is missing", () => {
    expect(src).toMatch(/export function pulseHaptic/);
    // The helper must guard navigator existence and the vibrate function
    // — iOS Safari has no `navigator.vibrate`, so an unguarded call would
    // throw on the first scan and break the whole feedback path.
    expect(src).toMatch(/typeof navigator !==\s*"undefined"/);
    expect(src).toMatch(/typeof navigator\.vibrate ===\s*"function"/);
  });

  it("vibrates for 50 ms on each successful detection", () => {
    expect(src).toMatch(/navigator\.vibrate\(50\)/);
  });

  it("renders a 200 ms green capture-flash overlay with a stable testid", () => {
    // Flash duration must match the spec so users get instant visual
    // confirmation; testid lets future component tests hook into it.
    expect(src).toMatch(/setTimeout\(\(\) => setFlash\(false\), 200\)/);
    expect(src).toMatch(/data-testid="capture-flash"/);
    expect(src).toMatch(/bg-emerald-400/);
  });

  it("caps the recent-scans strip at RECENT_SCANS_LIMIT (=3)", () => {
    expect(src).toMatch(/export const RECENT_SCANS_LIMIT = 3/);
    // The slice ensures the strip never grows past the cap regardless
    // of how many scans the user fires off in a row.
    expect(src).toMatch(/\.slice\(0, RECENT_SCANS_LIMIT\)/);
  });

  it("multi-scan path keeps the camera live (no stopCamera) and calls onAutoCommit", () => {
    // The multi-scan branch must NOT stop the camera, otherwise it
    // turns off after the first scan and defeats the whole feature.
    const multiScanBlock = src.match(
      /if \(keepScanningRef\.current && multiScanAvailable && onAutoCommit\) \{[\s\S]*?return;\s*\n\s*\}/,
    );
    expect(multiScanBlock).toBeTruthy();
    expect(multiScanBlock?.[0]).toMatch(/await onAutoCommit\(result\)/);
    expect(multiScanBlock?.[0]).not.toMatch(/stopCamera\(\)/);
  });

  it("default single-scan path still closes the camera + calls onDetected", () => {
    // Regression: don't break the existing AddItemDialog flow.
    expect(src).toMatch(/onDetected\(result\);\s*\n\s*stopCamera\(\);/);
  });

  it("dedupes identical barcodes within a 2-second window (camera-jitter guard)", () => {
    // ZXing in particular fires the same barcode several times per
    // second once it locks on. Without this dedup, multi-scan mode
    // would auto-add the same product 5–10 times per real scan.
    expect(src).toMatch(/lastScanAtRef/);
    expect(src).toMatch(/now - last\.at < 2000/);
  });

  it("Undo button calls onUndoCommit with the createdItemId and marks the entry undone", () => {
    expect(src).toMatch(/await onUndoCommit\(entry\.createdItemId\)/);
    // `undone: true` is what greys out + line-throughs the row so the
    // user can see they already undid it (vs. a stale UI that suggests
    // undo is still possible).
    expect(src).toMatch(/r\.clientId === entry\.clientId.*undone:\s*true/);
  });
});

/**
 * AddItemDialog must wire the new auto-commit + undo callbacks into the
 * scanner so multi-scan mode is actually reachable. The dialog is also
 * the only consumer of the scanner today, so a missing wiring would
 * silently disable the feature in production.
 */
describe("AddItemDialog multi-scan wiring", () => {
  const root = resolve(__dirname, "..");
  const src = readFileSync(
    resolve(root, "client/src/components/AddItemDialog.tsx"),
    "utf8",
  );

  it("passes onAutoCommit and onUndoCommit into BarcodeScannerSheet", () => {
    expect(src).toMatch(/onAutoCommit=\{autoCommitScan\}/);
    expect(src).toMatch(/onUndoCommit=\{undoCommit\}/);
  });

  it("autoCommitScan calls items.create via the tRPC client and returns the new id", () => {
    expect(src).toMatch(/utils\.client\.items\.create\.mutate/);
    expect(src).toMatch(/return created\?\.id \?\? null/);
  });

  it("undoCommit soft-deletes via items.softDelete + invalidates the lists", () => {
    expect(src).toMatch(/softDelete\.mutateAsync\(\{ itemId \}\)/);
    expect(src).toMatch(/utils\.items\.list\.invalidate\(\)/);
  });
});


/**
 * Production-safety: a failing auto-commit must NEVER produce a
 * recent-scan row. Prior to this guard, a null return from the parent
 * (e.g. items.create rejected by the server) would still push an entry
 * with `createdItemId: undefined`, leaving the user looking at a row
 * with a dead Undo button while the underlying scan was never saved.
 *
 * Two requirements enforced here:
 *   1. The RecentScan type must require `createdItemId` (number, not optional).
 *   2. Both the camera-detect and manual-entry paths must return early
 *      with a toast on `createdItemId == null`, before reaching setRecent.
 */
describe("BarcodeScanner auto-commit failure semantics", () => {
  const root = resolve(__dirname, "..");
  const src = readFileSync(
    resolve(root, "client/src/components/BarcodeScanner.tsx"),
    "utf8",
  );

  it("RecentScan.createdItemId is a required number (no `?:`)", () => {
    // The type alone makes it a compile-time error to push an entry
    // without a real id, which is the strongest guard available.
    expect(src).toMatch(/createdItemId:\s*number;/);
    expect(src).not.toMatch(/createdItemId\?:\s*number/);
  });

  it("camera path bails out with a toast when onAutoCommit returns null", () => {
    // Find the multi-scan branch and assert the null guard is present
    // BEFORE the setRecent call (i.e. an early return).
    const multiScanBlock = src.match(
      /if \(keepScanningRef\.current && multiScanAvailable && onAutoCommit\) \{[\s\S]*?setRecent\(/,
    );
    expect(multiScanBlock).toBeTruthy();
    expect(multiScanBlock?.[0]).toMatch(
      /if \(createdItemId == null\) \{[\s\S]*?toast\.error[\s\S]*?return;/,
    );
  });

  it("manual entry path uses the same null-guard before adding to the strip", () => {
    // The manual submit reuses the same multi-scan rules; without the
    // guard, typing a barcode whose create fails would still pollute
    // the recent strip.
    const manualBlock = src.match(
      /async function submitManual[\s\S]*?if \(keepScanningRef\.current[\s\S]*?setRecent\(/,
    );
    expect(manualBlock).toBeTruthy();
    expect(manualBlock?.[0]).toMatch(
      /if \(createdItemId == null\) \{[\s\S]*?toast\.error[\s\S]*?return;/,
    );
  });

  it("Undo button no longer needs to defensively check createdItemId — type guarantees it", () => {
    // Since createdItemId is now required, the JSX-level guard
    // `r.createdItemId && ...` is redundant and was removed. Keeping
    // it would suggest the field can be missing, which contradicts
    // the type. This test guards against the redundant guard creeping
    // back in via copy-paste.
    expect(src).not.toMatch(/r\.createdItemId\s*&&\s*!r\.undone/);
  });
});
