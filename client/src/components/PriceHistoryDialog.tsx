import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { TEXAS_STORES } from "@shared/pantri";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number | null;
  itemName?: string;
}

const STORE_BY_SLUG = Object.fromEntries(TEXAS_STORES.map((s) => [s.slug, s] as const));

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PriceHistoryDialog({ open, onOpenChange, itemId, itemName }: Props) {
  const utils = trpc.useUtils();
  const enabled = open && itemId !== null;
  const pricesQuery = trpc.items.prices.useQuery(
    { itemId: itemId ?? 0 },
    { enabled }
  );

  const [store, setStore] = useState<string>(TEXAS_STORES[0].slug);
  const [priceText, setPriceText] = useState<string>("");
  const [unit, setUnit] = useState<string>("ea");

  const recordPrice = trpc.items.recordPrice.useMutation({
    onSuccess: () => {
      toast.success("Price recorded");
      setPriceText("");
      void utils.items.prices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const data = pricesQuery.data ?? [];
    if (data.length === 0) return null;
    const cents = data.map((d) => Number(d.priceCents));
    const min = Math.min(...cents);
    const max = Math.max(...cents);
    const avg = cents.reduce((s, n) => s + n, 0) / cents.length;
    const cheapest = data.find((d) => Number(d.priceCents) === min);
    return { min, max, avg, cheapest };
  }, [pricesQuery.data]);

  function submit() {
    if (!itemId) return;
    const num = Number(priceText.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    recordPrice.mutate({
      itemId,
      storeSlug: store as never,
      priceCents: Math.round(num * 100),
      quantity: 1,
      unit,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Price history</DialogTitle>
          <DialogDescription>
            {itemName ? `Track what you've paid for ${itemName} across stores.` : "Track prices across stores."}
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <div className="grid grid-cols-3 gap-2 my-2">
            <Stat label="Lowest" value={formatCents(stats.min)} hint={STORE_BY_SLUG[stats.cheapest?.storeSlug ?? ""]?.name} />
            <Stat label="Average" value={formatCents(Math.round(stats.avg))} />
            <Stat label="Highest" value={formatCents(stats.max)} />
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent observations</h3>
          {pricesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (pricesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No prices recorded yet. Add the first below or import a receipt.</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {(pricesQuery.data ?? []).map((p) => {
                const store = STORE_BY_SLUG[p.storeSlug];
                const date = new Date(p.recordedAt);
                return (
                  <li key={p.id} className="flex items-center gap-3 text-sm border-b border-border/50 py-1.5">
                    <span className="flex-1">{store?.name ?? p.storeSlug}</span>
                    <span className="font-medium tabular-nums">{formatCents(Number(p.priceCents))}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{date.toLocaleDateString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 mt-2 pt-3 border-t">
          <h3 className="text-sm font-medium">Record a price</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ph-store">Store</Label>
              <Select value={store} onValueChange={setStore}>
                <SelectTrigger id="ph-store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEXAS_STORES.map((s) => (
                    <SelectItem key={s.slug} value={s.slug}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ph-price">Price (USD)</Label>
              <Input
                id="ph-price"
                type="text"
                inputMode="decimal"
                placeholder="3.99"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ph-unit">Unit (optional)</Label>
              <Input
                id="ph-unit"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ea, lb, gal, oz"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={submit} disabled={recordPrice.isPending}>
            {recordPrice.isPending ? "Saving…" : "Add price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-card/80 border border-border/60 px-3 py-2 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg leading-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}
