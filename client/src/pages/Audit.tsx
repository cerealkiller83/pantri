import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { POLLING_INTERVAL_MS } from "@shared/pantri";
import { ArrowLeft, ScrollText } from "lucide-react";
import { Link } from "wouter";

export function AuditPage({ householdId }: { householdId: number }) {
  const auditQuery = trpc.items.audit.useQuery(
    { householdId, limit: 200 },
    { refetchInterval: POLLING_INTERVAL_MS }
  );

  return (
    <AppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="tactile p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl">Activity</h1>
            <p className="text-sm text-muted-foreground">
              A running log of changes in this household.
            </p>
          </div>
        </div>

        {!auditQuery.data && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}

        {auditQuery.data && auditQuery.data.length === 0 && (
          <div className="text-sm text-muted-foreground">No activity yet.</div>
        )}

        {auditQuery.data && auditQuery.data.length > 0 && (
          <ol className="space-y-3 relative pl-4 border-l border-border">
            {auditQuery.data.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[19px] top-2 h-2 w-2 rounded-full bg-primary" />
                <div className="text-sm leading-snug">{a.summary}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        )}

        {auditQuery.data && auditQuery.data.length >= 200 && (
          <div className="mt-4">
            <Button
              variant="outline"
              className="bg-card"
              onClick={() => void auditQuery.refetch()}
            >
              Refresh
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
