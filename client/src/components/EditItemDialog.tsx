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
import { TEXAS_STORES } from "@shared/pantri";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  storeSlug?: string | null;
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
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lowStock, setLowStock] = useState<string>("");
  const [storeSlug, setStoreSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQuantity(item.quantity);
    setNote(item.note ?? "");
    setExpiryDate(msToDateInput(item.expiresAt));
    setLowStock(
      item.lowStockThreshold === null || item.lowStockThreshold === undefined
        ? ""
        : String(item.lowStockThreshold)
    );
    setStoreSlug(item.storeSlug ?? null);
  }, [item]);

  if (!item) return null;
  const isPantry = item.kind === "pantry";
  const isShopping = item.kind === "shopping";

  function submit() {
    if (!item) return;
    if (!name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    update.mutate({
      itemId: item.id,
      name: name.trim(),
      quantity: Math.max(0, Math.min(999, quantity)),
      note: note.trim() ? note.trim() : null,
      ...(isShopping ? { storeSlug } : {}),
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
              <Label htmlFor="edit-quantity">
                {item.kind === "staple" ? "Default quantity" : "Quantity"}
              </Label>
              <Input
                id="edit-quantity"
                type="number"
                min={0}
                max={999}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value || 0))}
              />
            </div>
            {isShopping && (
              <div className="grid gap-1.5">
                <Label htmlFor="edit-store">Store</Label>
                <Select value={storeSlug ?? "__general__"} onValueChange={(v) => setStoreSlug(v === "__general__" ? null : v)}>
                  <SelectTrigger id="edit-store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__general__">General</SelectItem>
                    {TEXAS_STORES.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

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
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
