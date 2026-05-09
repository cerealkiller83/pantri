import { useOfflineQueue } from "@/lib/useOfflineQueue";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";

/**
 * Shows in the header when there are pending offline mutations.
 * Click to inspect, manually flush, or discard.
 */
export function OfflineQueueBadge() {
  const { size, online, flushing, flush, discardAll, pending } = useOfflineQueue();
  if (size === 0 && online) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-card gap-1.5"
          aria-label="Offline queue"
        >
          {online ? (
            <CloudOff className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          <span className="text-xs font-medium tabular-nums">
            {size > 0 ? size : "Offline"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="font-display text-sm">
              {online ? "Pending sync" : "You're offline"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {size === 0
                ? "Changes you make will be queued and synced when you reconnect."
                : `${size} change${size === 1 ? "" : "s"} queued${online ? " — sync ready." : "."}`}
            </p>
          </div>
          {size > 0 && (
            <div className="rounded-md border border-border/60 max-h-40 overflow-y-auto">
              {pending.slice(0, 8).map((m) => (
                <div
                  key={m.id}
                  className="text-xs p-2 border-b border-border/40 last:border-b-0"
                >
                  <p className="font-medium">{labelFor(m.kind)}</p>
                  <p className="text-muted-foreground">
                    {new Date(m.createdAt).toLocaleTimeString()}
                    {m.attemptCount > 0 && ` · ${m.attemptCount} retr${m.attemptCount === 1 ? "y" : "ies"}`}
                  </p>
                </div>
              ))}
              {pending.length > 8 && (
                <p className="text-xs text-muted-foreground p-2">
                  …and {pending.length - 8} more
                </p>
              )}
            </div>
          )}
          {size > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={flush}
                disabled={flushing || !online}
                className="flex-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${flushing ? "animate-spin" : ""}`} />
                {flushing ? "Syncing…" : online ? "Sync now" : "Waiting…"}
              </Button>
              <Button size="sm" variant="ghost" onClick={discardAll}>
                Discard
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function labelFor(kind: string): string {
  switch (kind) {
    case "items.create":
      return "Add item";
    case "items.setChecked":
      return "Check / uncheck";
    case "items.adjustQuantity":
      return "Adjust quantity";
    case "items.softDelete":
      return "Delete";
    case "items.restore":
      return "Restore";
    default:
      return kind;
  }
}
