import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CATEGORY_BY_SLUG } from "@shared/pantri";
import { AlertTriangle, DollarSign, Minus, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo } from "react";

export interface ItemRowItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  note?: string | null;
  expiresAt?: number | null;
  lowStockThreshold?: number | null;
  checkedAt?: number | null;
  kind: "shopping" | "pantry" | "staple";
  photoUrl?: string | null;
}

interface ItemRowProps {
  item: ItemRowItem;
  onToggleCheck?: (next: boolean) => void;
  onPromote?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Adjust pantry quantity by +/- 1. Only shown for pantry items when provided. */
  onAdjustQuantity?: (delta: number) => void;
  /** Open price history sheet. */
  onShowPrices?: () => void;
  /** Larger touch targets for the fridge / kiosk view */
  large?: boolean;
}

function expiryChip(expiresAt: number | null | undefined) {
  if (!expiresAt) return null;
  const ms = expiresAt - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) {
    return { label: `Expired ${-days}d ago`, tone: "destructive" as const };
  }
  if (days === 0) return { label: "Expires today", tone: "warning" as const };
  if (days <= 3) return { label: `Expires in ${days}d`, tone: "warning" as const };
  return { label: `${days}d to expire`, tone: "muted" as const };
}

export function ItemRow({
  item,
  onToggleCheck,
  onPromote,
  onEdit,
  onDelete,
  onAdjustQuantity,
  onShowPrices,
  large,
}: ItemRowProps) {
  const cat = CATEGORY_BY_SLUG[item.category];
  const expiry = useMemo(() => expiryChip(item.expiresAt), [item.expiresAt]);
  const isLowStock =
    item.kind === "pantry" &&
    item.lowStockThreshold !== null &&
    item.lowStockThreshold !== undefined &&
    item.quantity <= item.lowStockThreshold;
  const checked = Boolean(item.checkedAt);

  return (
    <div
      className={[
        "group rounded-2xl border border-border/60 bg-card/80 backdrop-blur",
        "shadow-sm transition-all hover:shadow-md hover:bg-card",
        large ? "px-5 py-4" : "px-4 py-3",
        checked ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {item.kind === "shopping" && onToggleCheck && (
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => onToggleCheck(Boolean(v))}
            className={large ? "h-7 w-7" : "h-5 w-5"}
            aria-label={`Check off ${item.name}`}
          />
        )}

        {/*
          Per-item category emoji thumbnail removed (was misleading — emoji was
          guessed from the item's category, not the actual product). Real photo
          thumbnails (uploaded by the user) are kept because they're accurate.
          Category emojis still appear on section headers, where they're correct
          by construction (every item in the section IS that category).
        */}
        {item.photoUrl && (
          <img
            src={item.photoUrl}
            alt=""
            className={[
              "rounded-xl object-cover shrink-0",
              large ? "h-14 w-14" : "h-10 w-10",
            ].join(" ")}
          />
        )}

        <div className="flex-1 min-w-0">
          {/*
            Title uses a 2-line clamp instead of single-line truncate so long
            product names (e.g. "Bunny Grahams Chocolate") wrap to a second
            line rather than getting clipped on phone widths. The line-clamp
            still ellipsizes anything beyond two lines, so the row never grows
            unboundedly tall.  `break-words` ensures a single very long token
            (a barcode fallback name like "Barcode 893607001125") wraps too.
          */}
          <div
            className={[
              "font-medium leading-snug break-words",
              "line-clamp-2",
              checked ? "line-through" : "",
              large ? "text-lg" : "text-base",
            ].join(" ")}
          >
            {item.name}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            <span>
              {item.quantity} {item.unit}
            </span>
            {cat && <span className="hidden sm:inline">{cat.name}</span>}
            {item.note && <span className="italic truncate max-w-[16rem]">"{item.note}"</span>}
            {expiry && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  expiry.tone === "destructive"
                    ? "bg-destructive/10 text-destructive"
                    : expiry.tone === "warning"
                    ? "bg-accent/30 text-accent-foreground"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {expiry.tone !== "muted" && <AlertTriangle className="h-3 w-3" />}
                {expiry.label}
              </span>
            )}
            {isLowStock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/15 text-secondary-foreground px-2 py-0.5 text-[11px] font-medium">
                Low stock
              </span>
            )}
          </div>
        </div>

        {/*
          Action cluster: gap-0.5 on phone (more horizontal room for the title)
          and gap-1 on tablet+. shrink-0 prevents the cluster from being
          compressed when an item name pushes against it.
        */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {onAdjustQuantity && item.kind === "pantry" && (
            <div className="flex items-center gap-1 mr-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onAdjustQuantity(-1)}
                disabled={item.quantity <= 0}
                aria-label={`Decrease quantity of ${item.name}`}
                title="Use one"
                className="h-7 w-7"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-medium tabular-nums w-6 text-center">{item.quantity}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onAdjustQuantity(1)}
                aria-label={`Increase quantity of ${item.name}`}
                title="Add one"
                className="h-7 w-7"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {/*
            Primary promote action (pantry/staple → shopping) is always visible so it's
            discoverable on touch devices where there's no hover state. On staples it
            shows a labelled "Add to list" pill; on pantry rows it stays icon-only to
            keep the dense quantity-stepper row from getting cluttered.
          */}
          {onPromote && (item.kind === "pantry" || item.kind === "staple") && (
            item.kind === "staple" ? (
              /*
                Responsive primary action. On phones (< 640 px) we show only the
                cart icon to keep the row from wrapping when the item name is
                long; on tablet/fridge (>= 640 px or large variant) we restore
                the labelled "Add to list" pill so the action stays explicit on
                surfaces that have room for it. The aria-label is always
                present so screen readers and the kiosk's voice tools know the
                button's purpose regardless of breakpoint.
              */
              <Button
                size={large ? "default" : "sm"}
                variant="default"
                onClick={onPromote}
                aria-label={`Add ${item.name} to shopping list`}
                title="Add to shopping list"
                className="gap-1.5 mr-1 px-2 sm:px-3"
              >
                <ShoppingCart className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
                <span className={large ? "inline" : "hidden sm:inline"}>Add to list</span>
              </Button>
            ) : (
              <Button
                size={large ? "default" : "icon"}
                variant="outline"
                onClick={onPromote}
                aria-label={`Add ${item.name} to shopping list`}
                title="Add to shopping list"
                className="bg-card mr-1"
              >
                <ShoppingCart className="h-4 w-4" />
              </Button>
            )
          )}
          {/*
            All three secondary actions (edit, price history, delete) are now
            always visible — they were previously hidden behind hover/focus,
            which is invisible on touch devices (iPhone, Family Hub kiosk).
            Items soft-delete (30-day recoverable from Recently Deleted), so a
            single-tap delete is acceptable.
          */}
          {onEdit && (
            <Button
              size={large ? "default" : "icon"}
              variant="ghost"
              onClick={onEdit}
              aria-label={`Edit ${item.name}`}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onShowPrices && (
            <Button
              size={large ? "default" : "icon"}
              variant="ghost"
              onClick={onShowPrices}
              aria-label={`Price history for ${item.name}`}
              title="Price history"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              size={large ? "default" : "icon"}
              variant="ghost"
              onClick={onDelete}
              aria-label={`Delete ${item.name}`}
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
