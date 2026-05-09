import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Camera, Keyboard, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export interface BarcodeResult {
  barcode: string;
  productName?: string;
  category?: string;
  brand?: string;
  imageUrl?: string;
}

/**
 * One entry in the recent-scans strip. We keep the displayed name and
 * the barcode (so we can show the user a meaningful label when the OFF
 * lookup didn't return a product name) plus the createdItemId returned
 * by the multi-scan auto-commit, which is what `onUndo` operates on.
 */
export interface RecentScan {
  /** Stable client-side id so the strip's React keys don't collide on duplicate barcodes. */
  clientId: string;
  barcode: string;
  productName?: string;
  /** Server item id returned by the auto-commit path. Always set when an entry is shown in the strip — entries with no id are never created. */
  createdItemId: number;
  /** True while the user has already tapped Undo on this scan. */
  undone: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Single-scan path. Called when a barcode is detected (or typed manually)
   * and the OFF lookup completes. The parent decides what to do with the
   * result — typically pre-fill the AddItemDialog.
   *
   * In multi-scan mode this is NOT called; instead the parent uses
   * `onAutoCommit` to create the item itself and return the new id.
   */
  onDetected: (result: BarcodeResult) => void;
  /**
   * Multi-scan path. When provided AND multi-scan mode is on, the sheet
   * stays open after each scan, calls this with the result, and expects
   * back the new item id (or null on failure). Used to populate the
   * recent-scans strip's Undo button.
   */
  onAutoCommit?: (result: BarcodeResult) => Promise<number | null>;
  /**
   * Multi-scan undo path. Called with the createdItemId returned by a
   * previous onAutoCommit. The parent should soft-delete the item.
   */
  onUndoCommit?: (itemId: number) => Promise<void>;
}

/**
 * Map an Open Food Facts category guess to one of our internal CATEGORIES slugs.
 * The OFF API returns a comma-separated category path; we use the most general (first) part.
 */
function mapOFFCategoryToInternal(off: string | undefined): string | undefined {
  if (!off) return undefined;
  const lower = off.toLowerCase();
  if (lower.includes("dairy") || lower.includes("milk") || lower.includes("cheese") || lower.includes("yogurt")) return "dairy";
  if (lower.includes("meat") || lower.includes("beef") || lower.includes("pork") || lower.includes("chicken")) return "meat";
  if (lower.includes("fish") || lower.includes("seafood") || lower.includes("shrimp")) return "seafood";
  if (lower.includes("bread") || lower.includes("bakery") || lower.includes("pastry")) return "bakery";
  if (lower.includes("frozen")) return "frozen";
  if (lower.includes("beverage") || lower.includes("drink") || lower.includes("juice") || lower.includes("soda")) return "beverages";
  if (lower.includes("snack") || lower.includes("chocolate") || lower.includes("candy")) return "snacks";
  if (lower.includes("vegetable") || lower.includes("fruit") || lower.includes("produce")) return "produce";
  if (lower.includes("baby")) return "baby";
  if (lower.includes("pet") || lower.includes("dog") || lower.includes("cat food")) return "pet";
  if (lower.includes("personal") || lower.includes("hygiene") || lower.includes("cosmetic")) return "personal_care";
  if (lower.includes("household") || lower.includes("cleaning")) return "household";
  return "pantry";
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeResult> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    if (!res.ok) return { barcode };
    const json = await res.json();
    const p = json?.product;
    if (!p) return { barcode };
    return {
      barcode,
      productName: p.product_name || p.generic_name || undefined,
      brand: p.brands || undefined,
      category: mapOFFCategoryToInternal(p.categories),
      imageUrl: p.image_front_small_url || p.image_url || undefined,
    };
  } catch {
    return { barcode };
  }
}

/**
 * Decide which scanning engine to use.
 *
 * - Native `BarcodeDetector` is faster and burns less battery, but only
 *   Chromium-based browsers ship it. Safari/WebKit (and therefore EVERY
 *   iPhone PWA, regardless of which browser the user installed it from)
 *   does not implement it as of iOS 18.
 * - `@zxing/browser` is a pure-JS decoder that operates on a `<video>`
 *   stream. It works anywhere `getUserMedia` works, including iOS Safari
 *   and iOS PWAs, at the cost of a heavier per-frame CPU load.
 *
 * Exported so it can be unit-tested independently of the React component.
 */
export type ScanEngine = "native" | "zxing";
export function chooseScanEngine(win: Pick<typeof window, never> & { BarcodeDetector?: unknown }): ScanEngine {
  return "BarcodeDetector" in win && typeof (win as { BarcodeDetector?: unknown }).BarcodeDetector === "function"
    ? "native"
    : "zxing";
}

/**
 * Fire haptic feedback on devices that support it. iOS Safari does NOT
 * implement navigator.vibrate (Apple disabled it deliberately for
 * privacy/battery reasons), so this is a no-op there. On Android PWAs
 * and Chrome desktop with a connected device it produces a 50 ms pulse.
 *
 * Exported so tests can verify it gracefully no-ops without a vibrate API.
 */
export function pulseHaptic(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(50);
    }
  } catch {
    // Some browsers gate vibrate behind a user-activation requirement
    // and throw outside that window. Silently swallow — the visual
    // flash is the primary feedback path; haptic is a bonus.
  }
}

/**
 * Cap the recent-scans strip at this many entries. Three is a deliberate
 * choice: enough that a "wait, that wasn't milk, that was creamer" undo
 * is reachable, but few enough that the strip stays compact and doesn't
 * fight the camera viewfinder for vertical room.
 */
export const RECENT_SCANS_LIMIT = 3;

export function BarcodeScannerSheet({
  open,
  onOpenChange,
  onDetected,
  onAutoCommit,
  onUndoCommit,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<unknown>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Re-entrancy guard for handleDetected. We use a ref instead of the
  // `busy` React state because the camera loop fires faster than React
  // can schedule a re-render — a state-based guard would let multiple
  // OFF lookups race for the same scan. Resetting it on every sheet
  // open is what fixes the "stuck on Looking up..." bug.
  const lookupInFlightRef = useRef<boolean>(false);

  // The keep-scanning toggle is held in a ref AS WELL AS state so the
  // camera loop's tight inner functions can read the latest value
  // without re-binding closures every time the user flips the switch.
  const keepScanningRef = useRef<boolean>(false);

  // After a successful auto-commit we briefly suppress the same barcode
  // so a small camera jitter can't double-add the same item. Two
  // seconds is enough for the user to move the camera to the next
  // product but short enough that an intentional re-scan still works.
  const lastScanAtRef = useRef<{ barcode: string; at: number } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<ScanEngine | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [keepScanning, setKeepScanning] = useState(false);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [flash, setFlash] = useState(false);

  // Multi-scan only makes sense if the parent provided the auto-commit hook.
  const multiScanAvailable = typeof onAutoCommit === "function";

  useEffect(() => {
    if (!open) {
      stopCamera();
      setBusy(false);
      setManual("");
      setRecent([]);
      setFlash(false);
      lookupInFlightRef.current = false;
      lastScanAtRef.current = null;
      keepScanningRef.current = false;
      setKeepScanning(false);
      return;
    }
    setError(null);
    setBusy(false);
    lookupInFlightRef.current = false;
    lastScanAtRef.current = null;
    const chosen = chooseScanEngine(window as unknown as { BarcodeDetector?: unknown });
    setEngine(chosen);
    void startCamera(chosen);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the ref synced with the toggle state so the camera loop sees changes immediately.
  useEffect(() => {
    keepScanningRef.current = keepScanning;
  }, [keepScanning]);

  async function startCamera(chosen: ScanEngine) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (chosen === "native") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        detectorRef.current = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
        });
        tickNative();
      } else {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        zxingRef.current = new BrowserMultiFormatReader(hints);
        if (videoRef.current) {
          const controls = await zxingRef.current.decodeFromVideoElement(
            videoRef.current,
            (result) => {
              if (!result) return;
              const raw = result.getText();
              if (!raw) return;
              void handleDetected(raw);
            }
          );
          zxingControlsRef.current = controls;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera unavailable";
      setError(msg);
    }
  }

  function stopCamera() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch { /* ignore */ }
      zxingControlsRef.current = null;
    }
    zxingRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current = null;
  }

  /**
   * Trigger the green-flash + haptic feedback animation. Resets after
   * 200 ms so back-to-back scans each get their own visible flash.
   */
  function triggerCaptureFeedback() {
    pulseHaptic();
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }

  async function handleDetected(raw: string) {
    if (lookupInFlightRef.current) return;

    // Per-scan dedup. ZXing in particular fires the same barcode many
    // times per second once it locks on; we only want one auto-commit.
    const now = Date.now();
    const last = lastScanAtRef.current;
    if (last && last.barcode === raw && now - last.at < 2000) {
      return;
    }
    lastScanAtRef.current = { barcode: raw, at: now };

    lookupInFlightRef.current = true;
    setBusy(true);
    triggerCaptureFeedback();

    try {
      const result = await lookupOpenFoodFacts(raw);

      // Multi-scan path: parent commits the item itself and tells us the new id.
      if (keepScanningRef.current && multiScanAvailable && onAutoCommit) {
        let createdItemId: number | null = null;
        try {
          createdItemId = await onAutoCommit(result);
        } catch (err) {
          console.warn("[BarcodeScanner] auto-commit failed", err);
          toast.error("Couldn't add that item — try again");
          return;
        }
        // A null/undefined return means the parent caught its own error.
        // Without this guard the recent-scans strip would display a row
        // whose Undo button is dead (no itemId), giving the false
        // impression the scan was added when it wasn't.
        if (createdItemId == null) {
          toast.error("Couldn't add that item — try again");
          return;
        }
        const entry: RecentScan = {
          clientId: `${raw}-${now}`,
          barcode: raw,
          productName: result.productName,
          createdItemId,
          undone: false,
        };
        setRecent((prev) => [entry, ...prev].slice(0, RECENT_SCANS_LIMIT));
        // Camera stays live; just release the in-flight gate.
        return;
      }

      // Default single-scan path: hand the result back to the parent
      // (which typically pre-fills its AddItemDialog) and close.
      onDetected(result);
      stopCamera();
    } finally {
      lookupInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function tickNative() {
    if (!videoRef.current || !detectorRef.current || lookupInFlightRef.current) {
      rafRef.current = requestAnimationFrame(tickNative);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codes = await (detectorRef.current as any).detect(videoRef.current);
      if (Array.isArray(codes) && codes.length > 0 && codes[0]?.rawValue) {
        await handleDetected(String(codes[0].rawValue));
        return;
      }
    } catch {
      // Detection can fail per-frame; just keep trying.
    }
    rafRef.current = requestAnimationFrame(tickNative);
  }

  async function submitManual() {
    if (!manual.trim()) return;
    if (lookupInFlightRef.current) return;
    lookupInFlightRef.current = true;
    setBusy(true);
    try {
      const result = await lookupOpenFoodFacts(manual.trim());
      // Manual entry follows the same multi-scan rules as live detection.
      if (keepScanningRef.current && multiScanAvailable && onAutoCommit) {
        let createdItemId: number | null = null;
        try {
          createdItemId = await onAutoCommit(result);
        } catch (err) {
          console.warn("[BarcodeScanner] auto-commit (manual) failed", err);
          toast.error("Couldn't add that item — try again");
          return;
        }
        if (createdItemId == null) {
          toast.error("Couldn't add that item — try again");
          return;
        }
        triggerCaptureFeedback();
        const entry: RecentScan = {
          clientId: `${manual}-${Date.now()}`,
          barcode: manual.trim(),
          productName: result.productName,
          createdItemId,
          undone: false,
        };
        setRecent((prev) => [entry, ...prev].slice(0, RECENT_SCANS_LIMIT));
        return;
      }
      onDetected(result);
    } finally {
      lookupInFlightRef.current = false;
      setBusy(false);
      setManual("");
    }
  }

  async function handleUndo(entry: RecentScan) {
    if (entry.undone || !entry.createdItemId || !onUndoCommit) return;
    try {
      await onUndoCommit(entry.createdItemId);
      setRecent((prev) =>
        prev.map((r) => (r.clientId === entry.clientId ? { ...r, undone: true } : r)),
      );
      toast.info("Removed from list");
    } catch (err) {
      console.warn("[BarcodeScanner] undo failed", err);
      toast.error("Couldn't undo — try removing from the list directly");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan a barcode
          </SheetTitle>
          <SheetDescription>
            Point your camera at the barcode, or type the digits below if scanning isn&apos;t available.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 mt-4 grid gap-4 px-4 overflow-y-auto">
          {!error && (
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {/* The reticle: a transparent rounded rectangle with a
                  vignette around it so the user knows where to aim. */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-1/3 border-2 border-primary/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {/* Capture flash. The 200 ms green pulse confirms a scan
                  registered before the OFF lookup completes — without
                  it, users are tempted to scan the same code twice. */}
              <div
                aria-hidden
                className={`absolute inset-0 pointer-events-none transition-opacity duration-150 ${
                  flash ? "bg-emerald-400/55 opacity-100" : "opacity-0"
                }`}
                data-testid="capture-flash"
              />
              <Button
                variant="secondary"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="absolute top-3 right-3 bg-card"
                aria-label="Close scanner"
              >
                <X className="h-4 w-4" />
              </Button>
              {engine === "zxing" && (
                <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                  Live scanning (compatibility mode)
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive p-4 text-sm">
              {error} — please use manual entry below.
            </div>
          )}

          {multiScanAvailable && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div>
                <Label htmlFor="keep-scanning" className="cursor-pointer text-sm font-medium">
                  Keep scanning
                </Label>
                <p className="text-xs text-muted-foreground">
                  Stay open and add each scan automatically (great for a Costco run)
                </p>
              </div>
              <Switch
                id="keep-scanning"
                checked={keepScanning}
                onCheckedChange={setKeepScanning}
              />
            </div>
          )}

          {recent.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Last {RECENT_SCANS_LIMIT} scans</Label>
              <ul className="grid gap-1.5">
                {recent.map((r) => (
                  <li
                    key={r.clientId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      r.undone ? "opacity-60 line-through" : "bg-card"
                    }`}
                  >
                    <span className="truncate pr-2">
                      {r.productName ? r.productName : `Barcode ${r.barcode}`}
                    </span>
                    {!r.undone && onUndoCommit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => void handleUndo(r)}
                        aria-label={`Undo adding ${r.productName ?? r.barcode}`}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Undo
                      </Button>
                    )}
                    {r.undone && (
                      <span className="text-xs text-muted-foreground">Removed</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 pt-2">
            <Label htmlFor="manual" className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" /> Or type the barcode
            </Label>
            <div className="flex gap-2">
              <Input
                id="manual"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                inputMode="numeric"
                placeholder="e.g., 0123456789012"
              />
              <Button
                onClick={() => {
                  void submitManual().catch((e) => toast.error(String(e)));
                }}
                disabled={busy || !manual.trim()}
              >
                {busy ? "Looking up..." : "Look up"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
