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
import { enqueue, isTransientNetworkError } from "@/lib/offlineQueue";
import { CATEGORIES } from "@shared/pantri";
import { Camera, ScanLine, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BarcodeScannerSheet, type BarcodeResult } from "./BarcodeScanner";

type ItemKind = "shopping" | "pantry" | "staple";

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: number;
  defaultKind: ItemKind;
}

export function AddItemDialog({ open, onOpenChange, householdId, defaultKind }: AddItemDialogProps) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("ea");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ItemKind>(defaultKind);
  const [barcode, setBarcode] = useState<string | undefined>();
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [scanOpen, setScanOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadPhoto = trpc.items.uploadPhoto.useMutation();

  function pickPhoto(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Photo must be under 6 MB");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // strip data:...;base64, prefix
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  const softDelete = trpc.items.softDelete.useMutation();

  const create = trpc.items.create.useMutation({
    onSuccess: async (res) => {
      // Chain photo upload if one was selected
      if (photoFile) {
        try {
          const base64 = await fileToBase64(photoFile);
          const ct = photoFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
          await uploadPhoto.mutateAsync({
            itemId: res.id,
            contentType: ct,
            dataBase64: base64,
          });
        } catch (err) {
          console.warn("[AddItemDialog] photo upload failed", err);
          toast.warning("Item added, but the photo failed to upload");
        }
      }
      toast.success(`Added ${name}`);
      await utils.items.list.invalidate();
      await utils.items.audit.invalidate();
      reset();
      onOpenChange(false);
    },
    onError: (err, vars) => {
      if (isTransientNetworkError(err)) {
        // Photo can't be queued (we'd lose the file ref between sessions),
        // so we drop the photo on offline-add and document the limitation.
        void enqueue("items.create", vars);
        toast.info(
          photoFile
            ? "Saved offline (photo skipped — add it after reconnecting)."
            : "Saved offline — will sync when reconnected.",
        );
        reset();
        onOpenChange(false);
        return;
      }
      toast.error(err.message);
    },
  });

  function reset() {
    setName("");
    setCategory("other");
    setQuantity(1);
    setUnit("ea");
    setNote("");
    setBarcode(undefined);
    setExpiryDate("");
    pickPhoto(null);
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Please enter an item name");
      return;
    }
    let expiresAt: number | undefined;
    if (kind === "pantry" && expiryDate) {
      const d = new Date(expiryDate);
      if (!isNaN(d.getTime())) expiresAt = d.getTime();
    }
    create.mutate({
      householdId,
      kind,
      name: name.trim(),
      category: category as never,
      quantity,
      unit,
      note: note.trim() || undefined,
      barcode,
      expiresAt,
    });
  }

  function onBarcodeScanned(detected: BarcodeResult) {
    setBarcode(detected.barcode);
    if (detected.productName && !name) setName(detected.productName);
    if (detected.category) setCategory(detected.category);
    setScanOpen(false);
    toast.success("Barcode found");
  }

  /**
   * Multi-scan auto-commit. Called by BarcodeScannerSheet for each scan
   * when the user has flipped Keep scanning ON. Returns the new item id
   * so the scanner can offer Undo. We use a fresh mutateAsync call here
   * (instead of the dialog's `create` mutation above, which has its own
   * onSuccess hook tied to the dialog lifecycle) so multi-scan adds
   * don't close the AddItemDialog or trigger the photo-upload chain.
   */
  async function autoCommitScan(detected: BarcodeResult): Promise<number | null> {
    const itemName = detected.productName?.trim() || `Barcode ${detected.barcode}`;
    try {
      const created = await utils.client.items.create.mutate({
        householdId,
        kind,
        name: itemName,
        category: (detected.category ?? "other") as never,
        quantity: 1,
        unit: "ea",
        note: detected.brand ? detected.brand : undefined,
        barcode: detected.barcode,
      });
      // Refresh the lists so the user sees the new item appear behind the sheet.
      await utils.items.list.invalidate();
      await utils.items.audit.invalidate();
      return created?.id ?? null;
    } catch (err) {
      console.warn("[AddItemDialog] auto-commit failed", err);
      return null;
    }
  }

  async function undoCommit(itemId: number) {
    await softDelete.mutateAsync({ itemId });
    await utils.items.list.invalidate();
    await utils.items.audit.invalidate();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Add to {kind === "shopping" ? "shopping list" : kind === "pantry" ? "pantry" : "staples"}</DialogTitle>
            <DialogDescription>What's going in the cart, the pantry, or set as a regular?</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="kind">Where does this go?</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ItemKind)}>
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopping">Shopping list</SelectItem>
                  <SelectItem value="pantry">Pantry inventory</SelectItem>
                  <SelectItem value="staple">Recurring staple</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="name">Item</Label>
              <div className="flex gap-2">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Whole milk, eggs, bread"
                  autoFocus
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setScanOpen(true)}
                  title="Scan barcode"
                  aria-label="Scan barcode"
                  className="bg-card"
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              {barcode && (
                <p className="text-xs text-muted-foreground">Barcode: {barcode}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1.5 col-span-1">
                <Label htmlFor="qty">Qty</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="grid gap-1.5 col-span-1">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="ea, lb, oz"
                />
              </div>
              <div className="grid gap-1.5 col-span-1">
                <Label htmlFor="cat">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="cat">
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
            </div>

            {kind === "pantry" && (
              <div className="grid gap-1.5">
                <Label htmlFor="expiry">Expires (optional)</Label>
                <Input
                  id="expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Brand, store preference, etc."
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Photo (optional)</Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              />
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Selected"
                    className="h-20 w-20 rounded-md object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => pickPhoto(null)}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs shadow"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => photoInputRef.current?.click()}
                  className="bg-card gap-2 justify-start"
                >
                  <Camera className="h-4 w-4" />
                  Take or choose a photo
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending || uploadPhoto.isPending}>
              {create.isPending || uploadPhoto.isPending ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScannerSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={onBarcodeScanned}
        onAutoCommit={autoCommitScan}
        onUndoCommit={undoCommit}
      />
    </>
  );
}
