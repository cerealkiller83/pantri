import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveHousehold } from "@/contexts/HouseholdContext";
import { trpc } from "@/lib/trpc";
import { ChevronDown, Home as HomeIcon, LogOut, Plus, Settings, User } from "lucide-react";
import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { OfflineQueueBadge } from "./OfflineQueueBadge";
import { PantriWordmark } from "./PantriWordmark";

/**
 * Authenticated app shell: glass top bar with brand, household switcher, and user menu.
 * Wraps page content with a centered, max-width main area.
 */
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, logout } = useAuth();
  const { activeHouseholdId, setActiveHouseholdId } = useActiveHousehold();
  const [, setLocation] = useLocation();

  const householdsQuery = trpc.households.list.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const households = householdsQuery.data ?? [];
  const active = households.find((h) => h.id === activeHouseholdId);

  return (
    <div className="min-h-screen flex flex-col">
      {/*
        On iPhone home-screen installs the iOS status bar (time/signal/battery)
        sits in the area defined by env(safe-area-inset-top). We pad the header
        by that amount so the system bar never overlaps the brand wordmark.
        On non-notched devices and desktop, env() resolves to 0px so there is
        no visible change.
      */}
      {/*
        Full-bleed header. The glass background MUST span the whole viewport
        edge-to-edge so on iPhone PWAs the cream/glass surface doesn't end
        mid-screen and reveal the body's peach gradient as a vertical seam.
        Only the inner row is wrapped in `.container` so its content stays
        aligned with the page body below it.
      */}
      <header
        className="sticky top-0 z-30 w-full glass-strong border-b border-border/40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container flex items-center gap-2 sm:gap-3 h-16">
          {/*
            Header brand: transparent text wordmark only. wouter v3 renders
            <Link> itself as an <a>, so passing className directly avoids the
            nested-anchor DOM warning that occurs when wrapping an inner <a>.
          */}
          <Link href="/" className="flex items-center mr-2">
            <PantriWordmark asImage={false} size="md" className="text-primary" />
          </Link>

          {households.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1.5 text-sm font-medium">
                  <HomeIcon className="h-4 w-4 opacity-70" />
                  <span className="truncate max-w-[12rem]">{active?.name ?? "Choose household"}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuLabel>Your households</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {households.map((h) => (
                  <DropdownMenuItem
                    key={h.id}
                    onSelect={() => {
                      setActiveHouseholdId(h.id);
                      setLocation("/");
                    }}
                    className={h.id === activeHouseholdId ? "bg-accent/40" : ""}
                  >
                    <HomeIcon className="h-4 w-4 mr-2 opacity-70" />
                    <span className="truncate">{h.name}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.role}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setLocation("/households/new")}>
                  <Plus className="h-4 w-4 mr-2 opacity-70" />
                  Create new household
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLocation("/join")}>
                  <Plus className="h-4 w-4 mr-2 opacity-70" />
                  Join with code
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex-1" />

          {title && (
            <h1 className="hidden sm:block text-base font-semibold text-foreground/80 mr-2">
              {title}
            </h1>
          )}

          <OfflineQueueBadge />

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>
                  <div className="font-normal text-xs text-muted-foreground">Signed in as</div>
                  <div className="truncate">{user.name ?? user.email ?? "User"}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {active && (
                  <DropdownMenuItem onSelect={() => setLocation(`/households/${active.id}/settings`)}>
                    <Settings className="h-4 w-4 mr-2 opacity-70" />
                    Household settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => logout()}>
                  <LogOut className="h-4 w-4 mr-2 opacity-70" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Pad bottom by env(safe-area-inset-bottom) so the iPhone home indicator
          (the thin bar on Face-ID devices) does not overlap list rows or
          floating action buttons in PWA / standalone mode. */}
      <main
        className="flex-1 container py-6 sm:py-8"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
