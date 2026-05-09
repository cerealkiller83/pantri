import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PantriMark, PantriWordmark } from "@/components/PantriWordmark";
import { trpc } from "@/lib/trpc";
import { isAfterSunset } from "@/lib/sunset";
import { CATEGORIES, POLLING_INTERVAL_MS } from "@shared/pantri";
import {
  Check,
  ChevronLeft,
  Lock,
  Plus,
  Refrigerator,
  Sun,
  Moon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type KioskState =
  | { stage: "locked" }
  | {
      stage: "unlocked";
      verified: {
        householdId: number;
        name: string;
        latitude: string | null;
        longitude: string | null;
        permissions: {
          view: boolean;
          add: boolean;
          check: boolean;
          edit: boolean;
          delete: boolean;
        };
      };
      pin: string;
    };

/**
 * Kiosk mode for Samsung Family Hub fridge browser.
 * - Optimized for 10–24" landscape touchscreens with large tap targets
 * - PIN-locked: no OAuth needed (Family Hub browser handles it poorly)
 * - Auto-shifts to dark theme after local sunset
 * - Polls for changes every 5–10 seconds
 */
export function KioskPage({ householdId }: { householdId: number }) {
  const [state, setState] = useState<KioskState>({ stage: "locked" });
  const [pinInput, setPinInput] = useState("");

  const verify = trpc.kiosk.verify.useMutation({
    onSuccess: (data) => {
      setState({
        stage: "unlocked",
        verified: {
          householdId: data.householdId,
          name: data.name,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          permissions: data.permissions,
        },
        pin: pinInput,
      });
    },
    onError: (e) => {
      toast.error(e.message);
      setPinInput("");
    },
  });

  function tryUnlock() {
    if (!/^\d{4}$/.test(pinInput)) {
      toast.error("Enter a 4-digit PIN");
      return;
    }
    verify.mutate({ householdId, pin: pinInput });
  }

  if (state.stage === "locked") {
    return (
      <KioskLock
        householdId={householdId}
        pin={pinInput}
        onPin={setPinInput}
        onSubmit={tryUnlock}
        loading={verify.isPending}
      />
    );
  }
  return <KioskUnlocked state={state} onLock={() => setState({ stage: "locked" })} />;
}

/* -------------------------------------------------------------- LOCK SCREEN */

function KioskLock({
  householdId,
  pin,
  onPin,
  onSubmit,
  loading,
}: {
  householdId: number;
  pin: string;
  onPin: (s: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="kiosk min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-4 mb-12">
        <PantriMark size={88} />
        <PantriWordmark size="xl" />
      </div>

      <div className="tactile p-10 max-w-md w-full text-center space-y-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Lock className="h-5 w-5" />
          <span className="text-lg">Household {householdId}</span>
        </div>

        <div>
          <h1 className="font-display text-4xl mb-3">Enter PIN</h1>
          <p className="text-base text-muted-foreground">
            4 digits to unlock the family kiosk
          </p>
        </div>

        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="••••"
          className="font-mono text-5xl tracking-[0.6em] text-center h-20"
        />

        <Button onClick={onSubmit} disabled={loading} className="w-full h-14 text-lg">
          {loading ? "Unlocking…" : "Unlock"}
        </Button>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Pantri kiosk · Family Hub edition
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- UNLOCKED */

type UnlockedState = Extract<KioskState, { stage: "unlocked" }>;

function KioskUnlocked({
  state,
  onLock,
}: {
  state: UnlockedState;
  onLock: () => void;
}) {
  const { verified, pin } = state;
  const [manualDark, setManualDark] = useState<boolean | null>(null);

  // Compute dark mode based on sunset (recompute every minute)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const autoDark = useMemo(
    () =>
      isAfterSunset(
        verified.latitude ? Number(verified.latitude) : null,
        verified.longitude ? Number(verified.longitude) : null,
        now
      ),
    [verified.latitude, verified.longitude, now]
  );

  const dark = manualDark ?? autoDark;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [dark]);

  const shoppingQuery = trpc.kiosk.list.useQuery(
    { householdId: verified.householdId, pin, kind: "shopping", includeChecked: false },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const expiringQuery = trpc.kiosk.expiring.useQuery(
    { householdId: verified.householdId, pin, days: 7 },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const utils = trpc.useUtils();

  const setChecked = trpc.kiosk.setChecked.useMutation({
    onSuccess: () => {
      void utils.kiosk.list.invalidate({ householdId: verified.householdId, pin, kind: "shopping" });
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>("other");

  const add = trpc.kiosk.add.useMutation({
    onSuccess: () => {
      toast.success("Added to list");
      setNewName("");
      setShowAdd(false);
      void utils.kiosk.list.invalidate({ householdId: verified.householdId, pin, kind: "shopping" });
    },
    onError: (e) => toast.error(e.message),
  });

  function submitAdd() {
    if (!newName.trim()) return;
    add.mutate({
      householdId: verified.householdId,
      pin,
      name: newName.trim(),
      category: newCategory as "other",
      quantity: 1,
    });
  }

  const items = shoppingQuery.data ?? [];
  const expiring = expiringQuery.data ?? [];

  return (
    <div className="kiosk min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border/40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="container flex items-center gap-4 h-20">
          <Button variant="ghost" size="lg" onClick={onLock} className="text-base">
            <ChevronLeft className="h-6 w-6 mr-1" />
            Lock
          </Button>
          <div className="flex items-center gap-3">
            <Refrigerator className="h-7 w-7 text-primary" />
            <h1 className="font-display text-3xl truncate">{verified.name}</h1>
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setManualDark(dark ? false : true)}
            className="text-base"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
          </Button>
        </div>
      </header>

      <main className="container py-8 grid lg:grid-cols-[1fr_360px] gap-8">
        {/* Shopping list — primary column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-4xl">Shopping list</h2>
            {verified.permissions.add && (
              <Button size="lg" className="h-14 text-lg" onClick={() => setShowAdd((x) => !x)}>
                <Plus className="h-6 w-6 mr-2" />
                Add
              </Button>
            )}
          </div>

          {showAdd && (
            <div className="tactile p-4 space-y-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="What do you need?"
                autoFocus
                className="text-2xl h-14"
                onKeyDown={(e) => e.key === "Enter" && submitAdd()}
              />
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.slice(0, 8).map((c) => (
                  <Button
                    key={c.slug}
                    variant={newCategory === c.slug ? "default" : "outline"}
                    onClick={() => setNewCategory(c.slug)}
                    className="bg-card data-[state=active]:bg-primary"
                  >
                    <span className="mr-1.5">{c.emoji}</span>
                    {c.name}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="lg" onClick={submitAdd} disabled={add.isPending} className="flex-1 h-12 text-lg">
                  {add.isPending ? "Adding…" : "Add to list"}
                </Button>
                <Button size="lg" variant="outline" className="bg-card h-12" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="tactile p-10 text-center text-muted-foreground text-xl">
              All caught up. The shopping list is empty.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const cat = CATEGORIES.find((c) => c.slug === it.category);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      disabled={!verified.permissions.check}
                      onClick={() =>
                        setChecked.mutate({
                          householdId: verified.householdId,
                          pin,
                          itemId: it.id,
                          checked: true,
                        })
                      }
                      className="tactile w-full p-5 flex items-center gap-4 hover:bg-card/80 transition active:scale-[0.99] text-left disabled:opacity-60"
                    >
                      <div className="text-4xl shrink-0" aria-hidden>
                        {cat?.emoji ?? "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-2xl font-medium truncate">{it.name}</div>
                        {it.quantity && it.quantity > 1 && (
                          <div className="text-base text-muted-foreground">×{it.quantity}</div>
                        )}
                      </div>
                      {verified.permissions.check && (
                        <div className="h-12 w-12 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                          <Check className="h-7 w-7 text-primary" />
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right column: expiring soon */}
        <aside className="space-y-4">
          <h2 className="font-display text-2xl">Expiring soon</h2>
          {expiring.length === 0 ? (
            <div className="tactile p-6 text-center text-muted-foreground">
              Nothing expiring this week.
            </div>
          ) : (
            <ul className="space-y-2">
              {expiring.map((it) => {
                const days = it.expiresAt
                  ? Math.ceil((Number(it.expiresAt) - Date.now()) / 86_400_000)
                  : 0;
                return (
                  <li key={it.id} className="tactile p-4 flex items-center gap-3">
                    <div className="text-2xl">⏳</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {days <= 0 ? "Expired" : `${days} day${days === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="tactile p-4 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Auto theme</div>
            {verified.latitude && verified.longitude
              ? `Switches to ${autoDark ? "dark" : "light"} based on local sunset.`
              : "Set a location in household settings to enable auto dark mode after sunset."}
          </div>
        </aside>
      </main>
    </div>
  );
}
