import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useActiveHousehold } from "@/contexts/HouseholdContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { CATEGORY_BY_SLUG, STORE_BY_SLUG, TEXAS_STORES, type CategorySlug, type TexasStoreSlug } from "@shared/pantri";
import { Camera, ChevronLeft, FileImage, Loader2, ReceiptText, ShieldAlert, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

type ParsedLine = {
  rawText: string;
  name: string;
  category: string;
  isFood: boolean;
  quantity: number;
  priceCents: number | null;
  subtotalCents: number | null;
  preChecked: boolean;
  matchedItemId: number | null;
  matchedItemName: string | null;
};

type ParsedReceipt = {
  storeSlug: string | null;
  storeName: string | null;
  receiptDate: string | null;
  totalCents: number | null;
  lines: ParsedLine[];
};

type EditableLine = ParsedLine & {
  selected: boolean;
  useExistingMatch: boolean;
};

export default function ReceiptImport() {
  const { isAuthenticated, loading } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const status = trpc.receipts.status.useQuery(undefined, { enabled: isAuthenticated });
  const parse = trpc.receipts.parse.useMutation();
  const commit = trpc.receipts.commit.useMutation();
  const utils = trpc.useUtils();

  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [storeOverride, setStoreOverride] = useState<TexasStoreSlug | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const storeSlug = (storeOverride || parsed?.storeSlug || null) as TexasStoreSlug | null;

  const totalAdded = useMemo(() => lines.filter((l) => l.selected).length, [lines]);
  const totalCentsSelected = useMemo(
    () => lines.filter((l) => l.selected).reduce((sum, l) => sum + (l.priceCents ?? 0) * l.quantity, 0),
    [lines]
  );

  if (loading) return null;
  if (!isAuthenticated) {
    navigate("/");
    return null;
  }
  if (!activeHouseholdId) {
    return (
      <div className="container py-12 text-center">
        <p>Please pick a household first.</p>
        <Link href="/" className="text-primary underline">Go home</Link>
      </div>
    );
  }

  function onFile(file: File) {
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Image too large. Try a smaller photo (under 12 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      try {
        const result = await parse.mutateAsync({
          householdId: activeHouseholdId!,
          imageDataUrl: dataUrl,
        });
        setParsed(result);
        setLines(
          result.lines.map((l) => ({
            ...l,
            selected: l.preChecked,
            useExistingMatch: Boolean(l.matchedItemId),
          }))
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not parse the receipt");
      }
    };
    reader.readAsDataURL(file);
  }

  async function submitCommit() {
    if (!parsed) return;
    const selectedLines = lines.filter((l) => l.selected);
    if (selectedLines.length === 0) {
      toast.error("Pick at least one item to import");
      return;
    }
    if (!storeSlug && selectedLines.some((l) => l.priceCents != null)) {
      toast.warning(
        "Some items have prices but no store was identified. Pick a store to record price history."
      );
    }
    try {
      const res = await commit.mutateAsync({
        householdId: activeHouseholdId!,
        storeSlug,
        receiptDate: parsed.receiptDate,
        lines: selectedLines.map((l) => ({
          name: l.name,
          category: l.category as CategorySlug,
          quantity: l.quantity,
          priceCents: l.priceCents,
          mergeIntoItemId: l.useExistingMatch ? l.matchedItemId : null,
        })),
      });
      toast.success(
        `Imported. Added ${res.createdCount}, updated ${res.updatedCount}, recorded ${res.pricesRecorded} prices.`
      );
      void utils.items.invalidate();
      void utils.households.invalidate();
      navigate("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the receipt");
    }
  }

  return (
    <div className="container py-6 space-y-6 max-w-3xl">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="font-display text-3xl flex-1">Import a receipt</h1>
      </header>

      {status.data && !status.data.enabled && (
        <div className="tactile p-5 flex gap-3 items-start border-2 border-warning">
          <ShieldAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium">Receipt OCR is not yet enabled</h3>
            <p className="text-sm text-muted-foreground">
              Set <code className="text-foreground">OPENROUTER_API_KEY</code> in project secrets to turn this on.
              Get a free key at{" "}
              <a className="text-primary underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                openrouter.ai/keys
              </a>
              . Pantri uses a low-cost vision model (~$0.001 per receipt).
            </p>
          </div>
        </div>
      )}

      {!parsed && (
        <div className="tactile p-8 text-center space-y-4">
          <ReceiptText className="h-10 w-10 text-primary mx-auto" />
          <div>
            <h2 className="font-display text-2xl">Snap or upload a paper receipt</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Pantri reads it, pre-checks the food items, and adds them to your pantry — with prices auto-fed into your history.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={parse.isPending}>
              {parse.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              Take photo
            </Button>
            <Button
              variant="outline"
              className="bg-card"
              onClick={() => {
                if (!fileRef.current) return;
                fileRef.current.removeAttribute("capture");
                fileRef.current.click();
                setTimeout(() => fileRef.current?.setAttribute("capture", "environment"), 100);
              }}
              disabled={parse.isPending}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload from gallery
            </Button>
          </div>

          {parse.isPending && (
            <p className="text-sm text-muted-foreground">
              Reading receipt… this usually takes 5–15 seconds.
            </p>
          )}
        </div>
      )}

      {parsed && (
        <>
          <section className="tactile p-5 grid sm:grid-cols-[120px_1fr] gap-4 items-start">
            {imagePreview ? (
              <img src={imagePreview} alt="Receipt" className="rounded-lg max-h-32 object-cover w-full" />
            ) : (
              <div className="bg-muted rounded-lg flex items-center justify-center h-32">
                <FileImage className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Store:</span>{" "}
                  {parsed.storeSlug ? (
                    <span className="font-medium">{STORE_BY_SLUG[parsed.storeSlug]?.name}</span>
                  ) : (
                    <span className="text-muted-foreground italic">{parsed.storeName ?? "Not detected"}</span>
                  )}
                </div>
                {parsed.receiptDate && (
                  <div>
                    <span className="text-muted-foreground">Date:</span>{" "}
                    <span className="font-medium">{parsed.receiptDate}</span>
                  </div>
                )}
                {parsed.totalCents != null && (
                  <div>
                    <span className="text-muted-foreground">Receipt total:</span>{" "}
                    <span className="font-medium">${(parsed.totalCents / 100).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center text-sm">
                <span className="text-muted-foreground">Override store:</span>
                <select
                  className="bg-background border border-input rounded-md px-2 py-1 text-sm"
                  value={storeOverride}
                  onChange={(e) => setStoreOverride(e.target.value as TexasStoreSlug | "")}
                >
                  <option value="">{parsed.storeSlug ? "Use detected" : "Pick a store"}</option>
                  {TEXAS_STORES.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Line items</h2>
              <p className="text-sm text-muted-foreground">
                {totalAdded} selected · ${(totalCentsSelected / 100).toFixed(2)}
              </p>
            </div>
            <ul className="space-y-2">
              {lines.map((line, idx) => {
                const cat = CATEGORY_BY_SLUG[line.category];
                return (
                  <li key={idx} className="tactile p-3 flex items-start gap-3">
                    <Checkbox
                      checked={line.selected}
                      onCheckedChange={(v) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, selected: Boolean(v) } : l))
                        )
                      }
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <Input
                        value={line.name}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l))
                          )
                        }
                        className="text-base font-medium border-none px-0 h-auto bg-transparent shadow-none focus-visible:ring-0"
                      />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-1">
                        <span>{cat?.emoji} {cat?.name}</span>
                        {!line.isFood && <span className="px-1.5 py-0.5 rounded bg-muted">non-food</span>}
                        {line.quantity > 1 && <span>×{line.quantity}</span>}
                        {line.priceCents != null && (
                          <span>${(line.priceCents / 100).toFixed(2)}</span>
                        )}
                        {line.matchedItemId && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <Checkbox
                              checked={line.useExistingMatch}
                              onCheckedChange={(v) =>
                                setLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, useExistingMatch: Boolean(v) } : l
                                  )
                                )
                              }
                            />
                            <span>Merge into existing "{line.matchedItemName}"</span>
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-1 italic truncate">{line.rawText}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="flex gap-2 sticky bottom-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-3 shadow-lg">
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => {
                setParsed(null);
                setLines([]);
                setImagePreview(null);
              }}
            >
              Discard
            </Button>
            <Button onClick={submitCommit} disabled={commit.isPending} className="flex-1">
              {commit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {totalAdded} item{totalAdded === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
