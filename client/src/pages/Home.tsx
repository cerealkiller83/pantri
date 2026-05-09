import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PantriWordmark } from "@/components/PantriWordmark";
import { useActiveHousehold } from "@/contexts/HouseholdContext";
import { trpc } from "@/lib/trpc";
import { LOGIN_PATH } from "@/const";
import { Bell, ListChecks, Refrigerator, ScanLine, ShoppingBasket, Users } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Dashboard } from "./Dashboard";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { activeHouseholdId, setActiveHouseholdId } = useActiveHousehold();
  const householdsQuery = trpc.households.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [, setLocation] = useLocation();

  // Auto-select first household if user has one but nothing is active
  useEffect(() => {
    if (!householdsQuery.data) return;
    if (householdsQuery.data.length === 0) return;
    if (activeHouseholdId && householdsQuery.data.some((h) => h.id === activeHouseholdId)) return;
    setActiveHouseholdId(householdsQuery.data[0].id);
  }, [householdsQuery.data, activeHouseholdId, setActiveHouseholdId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // Unauthenticated: marketing landing page
  if (!isAuthenticated) {
    return <Landing onSignIn={() => setLocation(LOGIN_PATH)} />;
  }

  // Authenticated but no households: onboarding
  if (householdsQuery.data && householdsQuery.data.length === 0) {
    return <NoHouseholdLanding onCreate={() => setLocation("/households/new")} onJoin={() => setLocation("/join")} />;
  }

  // Authenticated with at least one household: full dashboard
  if (activeHouseholdId) return <Dashboard householdId={activeHouseholdId} />;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Choose a household from the menu above…</div>
    </div>
  );

  // unused
  void user;
}

function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header: transparent text wordmark only — no round "P" badge.
          The hero below uses a much larger image-rendered wordmark. */}
      <header className="container flex items-center gap-2 h-16" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <PantriWordmark asImage={false} size="md" className="text-primary" />
        <div className="flex-1" />
        <Button variant="ghost" onClick={onSignIn}>Sign in</Button>
      </header>

      <main className="flex-1 container py-10 sm:py-16 grid gap-12 lg:grid-cols-2 lg:items-center">
        <div className="space-y-6">
          <PantriWordmark asImage={false} size="xl" className="block text-primary" />
          <p className="text-2xl sm:text-3xl font-display leading-tight text-foreground/85">
            Your household, stocked.
          </p>
          <p className="text-lg text-muted-foreground max-w-xl">
            Pantri is a warm, simple shopping list and pantry app made for families.
            Share lists, track what's running low, and never wonder again whether you're
            out of eggs — install it on your phone and your fridge.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" onClick={onSignIn} className="text-base">
              Get started
            </Button>
            <Button size="lg" variant="outline" className="text-base bg-card" onClick={() => window.scrollTo({ top: 800, behavior: "smooth" })}>
              See features
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FeatureTile icon={ShoppingBasket} title="Shared shopping list" desc="Family check-off in real time" />
          <FeatureTile icon={Refrigerator} title="Pantry inventory" desc="Track what you have, with expiry" />
          <FeatureTile icon={ScanLine} title="Barcode scan" desc="Point, click, added to the list" />
          <FeatureTile icon={Bell} title="Gentle reminders" desc="Expiring? Low? You'll know." />
          <FeatureTile icon={Users} title="Multi-household" desc="Your family, and your friends'" />
          <FeatureTile icon={ListChecks} title="Audit trail" desc="See who added or checked what" />
        </div>
      </main>

      <footer className="container py-8 text-xs text-muted-foreground">
        <PantriWordmark asImage={false} size="sm" /> · A warm-tactile PWA for families · Texas-built
      </footer>
    </div>
  );
}

function FeatureTile({ icon: Icon, title, desc }: { icon: typeof ShoppingBasket; title: string; desc: string }) {
  return (
    <div className="tactile p-5 space-y-2">
      <Icon className="h-6 w-6 text-primary" />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function NoHouseholdLanding({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="min-h-screen flex items-center" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="container max-w-2xl mx-auto py-12 grid gap-8">
        <div className="text-center space-y-3">
          {/* Onboarding hero: transparent wordmark only, no round badge. */}
          <PantriWordmark asImage={false} size="xl" className="text-primary block" />
          <h1 className="text-2xl font-display">Welcome — let's set up your kitchen.</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            A household groups your shopping list, pantry, and family members.
            You can be in more than one — your family and your friends', for example.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={onCreate}
            className="tactile p-6 text-left hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
          >
            <Refrigerator className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-display text-xl mb-1">Create a household</h3>
            <p className="text-sm text-muted-foreground">
              Start fresh. Invite family members afterwards.
            </p>
          </button>
          <button
            onClick={onJoin}
            className="tactile p-6 text-left hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
          >
            <Users className="h-8 w-8 text-secondary mb-3" />
            <h3 className="font-display text-xl mb-1">Join with a code</h3>
            <p className="text-sm text-muted-foreground">
              Got a 6-character code from someone? Enter it here.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
