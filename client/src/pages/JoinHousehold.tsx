import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PantriWordmark } from "@/components/PantriWordmark";
import { useActiveHousehold } from "@/contexts/HouseholdContext";
import { trpc } from "@/lib/trpc";
import { LOGIN_PATH } from "@/const";
import { ArrowLeft, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export function JoinHousehold({ prefilledCode }: { prefilledCode?: string }) {
  const { isAuthenticated, loading } = useAuth();
  const [code, setCode] = useState(prefilledCode?.toUpperCase() ?? "");
  const utils = trpc.useUtils();
  const { setActiveHouseholdId } = useActiveHousehold();
  const [, setLocation] = useLocation();

  // Once a code is typed/pasted, peek at it
  const previewQuery = trpc.invites.preview.useQuery(
    { code: code.toUpperCase() },
    { enabled: isAuthenticated && code.length >= 4, retry: false }
  );

  const accept = trpc.invites.accept.useMutation({
    onSuccess: async ({ householdId }) => {
      toast.success("Joined!");
      await utils.households.list.invalidate();
      setActiveHouseholdId(householdId);
      setLocation("/");
    },
    onError: (e) => toast.error(e.message),
  });

  // If we got here with a prefilled code and are unauthenticated, redirect through login back to /join/:code
  useEffect(() => {
    if (!loading && !isAuthenticated && prefilledCode) {
      window.location.href = `${LOGIN_PATH}?returnTo=/join/${prefilledCode}`;
    }
  }, [loading, isAuthenticated, prefilledCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="tactile p-8 max-w-md text-center space-y-4">
          {/* Sign-in card hero: transparent wordmark only, no round badge. */}
          <PantriWordmark asImage={false} size="xl" className="text-primary block" />
          <h1 className="font-display text-2xl">Sign in to join</h1>
          <p className="text-muted-foreground">
            You'll need a Pantri account before accepting an invite.
          </p>
          <Button onClick={() => (window.location.href = `${LOGIN_PATH}?returnTo=/join`)}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container flex items-center gap-2 h-16" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="flex items-center">
          <PantriWordmark asImage={false} size="md" className="text-primary" />
        </Link>
      </header>

      <main className="flex-1 container max-w-md py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="tactile p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-secondary" />
            <div>
              <h1 className="font-display text-2xl">Join a household</h1>
              <p className="text-sm text-muted-foreground">
                Enter the 6-character invite code from your friend or family member.
              </p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="code">Invite code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              autoFocus
              maxLength={6}
              className="font-mono text-2xl tracking-[0.4em] text-center uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Codes are 6 letters and numbers. Case-insensitive.
            </p>
          </div>

          {previewQuery.data && (
            <div className="rounded-xl bg-secondary/10 border border-secondary/20 p-4 space-y-1">
              <div className="text-xs text-muted-foreground">You're being invited to:</div>
              <div className="font-display text-xl">{previewQuery.data.householdName}</div>
              <div className="text-xs text-muted-foreground">
                As a {previewQuery.data.role}
                {previewQuery.data.email && ` · for ${previewQuery.data.email}`}
              </div>
            </div>
          )}

          {previewQuery.error && code.length >= 4 && (
            <div className="rounded-xl bg-destructive/10 text-destructive border border-destructive/20 p-3 text-sm">
              {previewQuery.error.message}
            </div>
          )}

          <Button
            disabled={!previewQuery.data || accept.isPending}
            onClick={() => accept.mutate({ code: code.toUpperCase() })}
            className="w-full"
          >
            {accept.isPending ? "Joining…" : "Accept invitation"}
          </Button>
        </div>
      </main>
    </div>
  );
}
