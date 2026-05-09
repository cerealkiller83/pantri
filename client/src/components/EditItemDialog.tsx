import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CATEGORIES } from "@shared/pantri";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Edit dialog for an existing item on the shopping list, pantry, or staples.
 *
 * The backend `items.update` procedure accepts every editable field on the row
 * (name, category, quantity, unit, note, expiresAt, lowStockThreshold). This
 * component is the smallest possible UI surface that exercises that procedure,
 * deliberately scoped to the most-asked-for fields. Photo and barcode editing
 * still live in AddItemDialog (capture flows are heavier); changing those after
 * creation is rare enough to defer.
 *
 * Behavioural notes:
 *  - Quantity field shows for pantry + shopping (a shopping line still has a
 *    quantity). It's hidden on staples because staples are templates, not
 *    inventory; the quantity is set when you Add to list.
 *  - Expiry + low-stock threshold show only on pantry, mirroring AddItemDialog.
 *  - Cancel button is provided explicitly; closing via outside-click also
 *    discards changes (no autosave) so users can experiment without commitment.
 */
type ItemKind = "shopping" | "pantry" | "staple";

export interface EditableItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  note?: string | null;
  expiresAt?: number | null;
  lowStockThreshold?: number | null;
  kind: ItemKind;
}

interface EditItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EditableItem | null;
}

/** Convert a unix-ms expiry into a YYYY-MM-DD string for <input type="date">. */
function msToDateInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  // Use local date components (not UTC) so the date a user picks roundtrips
  // without shifting by a day in negative-UTC timezones (e.g. Texas).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert a YYYY-MM-DD string back to unix ms at local midnight, or null. */
function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

export function EditItemDialog({ open, onOpenChange, item }: EditItemDialogProps) {
  const utils = trpc.useUtils();
  const update = trpc.items.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      // Invalidate every kind because some edits (e.g. category) can affect
      // grouping; a single shotgun invalidate is cheaper than tracking which
      // tab the user is on.
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Local form state mirrors the server fields. We seed it from the incoming
  // item every time the dialog opens with a different item, so reopening on
  // a stale row never shows the previous row's values.
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("ea");
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lowStock, setLowStock] = useState<string>("");

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setCategory(item.category);
    setQuantity(item.quantity);
    setUnit(item.unit ?? "ea");
    setNote(item.note ?? "");
    setExpiryDate(msToDateInput(item.expiresAt));
    setLowStock(
      item.lowStockThreshold === null || item.lowStockThreshold === undefined
        ? ""
        : String(item.lowStockThreshold)
    );
  }, [item]);

  if (!item) return null;
  const isPantry = item.kind === "pantry";
  // Staples DO get a quantity field too — it's the default quantity used when
  // the staple is promoted onto the shopping list (e.g. "buy 2 cartons"). The
  // unit string is also editable so you can say "2 gallons" or "3 ea".

  function submit() {
    if (!item) return;
    if (!name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    update.mutate({
      itemId: item.id,
      name: name.trim(),
      category: category as Parameters<typeof update.mutate>[0]["category"],
      // Quantity is meaningful for shopping + pantry; pass it for staples too
      // so a numeric default exists, but it's harmless.
      quantity: Math.max(0, Math.min(999, quantity)),
      unit: unit.trim() || "ea",
      note: note.trim() ? note.trim() : null,
      // Only persist the pantry-specific fields when we're editing a pantry row,
      // so we never accidentally write an expiry onto a shopping/staple row.
      ...(isPantry
        ? {
            expiresAt: dateInputToMs(expiryDate),
            lowStockThreshold:
              lowStock.trim() === "" ? null : Math.max(0, Math.min(99, Number(lowStock))),
          }
        : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Edit {item.name}</DialogTitle>
          <DialogDescription>
            Update the details and tap save. Changes log to the activity feed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-quantity">
                {item.kind === "staple" ? "Default quantity" : "Quantity"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit-quantity"
                  type="number"
                  min={0}
                  max={999}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value || 0))}
                  className="flex-1"
                />
                <Input
                  aria-label="Unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
          </div>

          {/* Pantry-only fields below; not shown for shopping or staple kinds. */}
          {isPantry && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-expiry">Expires</Label>
                <Input
                  id="edit-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-lowstock">Low-stock at</Label>
                <Input
                  id="edit-lowstock"
                  type="number"
                  min={0}
                  max={99}
                  placeholder="off"
                  value={lowStock}
                  onChange={(e) => setLowStock(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="edit-note">Note</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brand, store, anything worth remembering"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
