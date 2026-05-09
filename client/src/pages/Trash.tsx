import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { runWithOfflineFallback } from "@/lib/useOfflineQueue";
import { SOFT_DELETE_DAYS } from "@shared/pantri";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export function TrashPage({ householdId }: { householdId: number }) {
  const utils = trpc.useUtils();
  const trashedQuery = trpc.items.listRecentlyDeleted.useQuery({ householdId });

  const restoreMutation = trpc.items.restore.useMutation({
    onSuccess: () => {
      toast.success("Restored");
      void utils.items.listRecentlyDeleted.invalidate({ householdId });
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  async function restore(itemId: number) {
    const result = await runWithOfflineFallback(
      "items.restore",
      { itemId },
      () => restoreMutation.mutateAsync({ itemId }),
    );
    if (result.ok && result.queued) {
      // Optimistically remove from the trash list view; server will sync on reconnect.
      void utils.items.listRecentlyDeleted.invalidate({ householdId });
    }
  }

  const items = trashedQuery.data ?? [];

  return (
    <AppShell>
      <Link href={`/households/${householdId}/settings`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <div className="tactile p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <Trash2 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="font-display text-2xl">Recently deleted</h1>
            <p className="text-sm text-muted-foreground">
              Items removed in the last {SOFT_DELETE_DAYS} days. Restore if needed.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here. The trash is empty.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((it) => {
              const daysAgo = it.deletedAt
                ? Math.max(0, Math.floor((Date.now() - Number(it.deletedAt)) / 86_400_000))
                : 0;
              return (
                <li key={it.id} className="py-3 flex items-center gap-3">
                  {/* Per-item category emoji thumbnail removed for consistency with ItemRow:
                      it was guessed from category, not the actual product. */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.kind} · deleted {daysAgo === 0 ? "today" : `${daysAgo}d ago`}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="bg-card"
                    onClick={() => void restore(it.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
