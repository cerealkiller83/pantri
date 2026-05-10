import { AddItemDialog } from "@/components/AddItemDialog";
import { AppShell } from "@/components/AppShell";
import { EditItemDialog, type EditableItem } from "@/components/EditItemDialog";
import { ItemRow } from "@/components/ItemRow";
import { PriceHistoryDialog } from "@/components/PriceHistoryDialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { enqueue, isTransientNetworkError } from "@/lib/offlineQueue";
import { POLLING_INTERVAL_MS, TEXAS_STORES, STORE_BY_SLUG } from "@shared/pantri";
import {
  Clock,
  ListChecks,
  Plus,
  Receipt,
  Refrigerator,
  ScrollText,
  Search,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export function Dashboard({ householdId }: { householdId: number }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"shopping" | "pantry" | "staple">("shopping");
  const [addOpen, setAddOpen] = useState(false);
  const [addDefaultKind, setAddDefaultKind] = useState<"shopping" | "pantry" | "staple">("shopping");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [priceItem, setPriceItem] = useState<{ id: number; name: string } | null>(null);
  // Item currently being edited (any kind). When non-null the EditItemDialog
  // is shown; closing it sets back to null. Using the full row keeps the
  // dialog stateless across opens — no manual reset needed.
  const [editItem, setEditItem] = useState<EditableItem | null>(null);

  const householdQuery = trpc.households.get.useQuery({ householdId });

  const shoppingQuery = trpc.items.list.useQuery(
    { householdId, kind: "shopping", includeChecked: true },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const pantryQuery = trpc.items.list.useQuery(
    { householdId, kind: "pantry" },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const staplesQuery = trpc.items.list.useQuery(
    { householdId, kind: "staple" },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const expiringQuery = trpc.items.listExpiring.useQuery(
    { householdId, days: 3 },
    { refetchInterval: POLLING_INTERVAL_MS }
  );
  const auditQuery = trpc.items.audit.useQuery(
    { householdId, limit: 25 },
    { refetchInterval: POLLING_INTERVAL_MS }
  );

  // Optimistic check-off / uncheck
  const setChecked = trpc.items.setChecked.useMutation({
    onMutate: async (vars) => {
      await utils.items.list.cancel({ householdId, kind: "shopping", includeChecked: true });
      const prev = utils.items.list.getData({ householdId, kind: "shopping", includeChecked: true });
      const now = Date.now();
      utils.items.list.setData(
        { householdId, kind: "shopping", includeChecked: true },
        (old) =>
          (old ?? []).map((it) =>
            it.id === vars.itemId ? { ...it, checkedAt: vars.checked ? now : null } : it
          )
      );
      return { prev };
    },
    onError: (e, vars, ctx) => {
      if (isTransientNetworkError(e)) {
        // Keep the optimistic state; queue the mutation for replay.
        void enqueue("items.setChecked", vars);
        toast.info("Saved offline — will sync when reconnected.");
        return;
      }
      if (ctx?.prev) {
        utils.items.list.setData(
          { householdId, kind: "shopping", includeChecked: true },
          ctx.prev
        );
      }
      toast.error(e.message);
    },
    onSettled: () => {
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
    },
  });

  const promote = trpc.items.promoteToShopping.useMutation({
    onSuccess: () => {
      toast.success("Added to shopping list");
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const softDelete = trpc.items.softDelete.useMutation({
    onMutate: async (vars) => {
      const keys = ["shopping", "pantry", "staple"] as const;
      const snapshots: Record<string, unknown> = {};
      for (const k of keys) {
        const includeChecked = k === "shopping";
        await utils.items.list.cancel({ householdId, kind: k, includeChecked });
        const prev = utils.items.list.getData({ householdId, kind: k, includeChecked });
        snapshots[k] = prev;
        utils.items.list.setData(
          { householdId, kind: k, includeChecked },
          (old) => (old ?? []).filter((it) => it.id !== vars.itemId)
        );
      }
      return { snapshots };
    },
    onSuccess: () => {
      toast.success("Removed (undo within 30 days from settings → trash)");
    },
    onError: (e, vars, ctx) => {
      if (isTransientNetworkError(e)) {
        void enqueue("items.softDelete", vars);
        toast.info("Saved offline — will sync when reconnected.");
        return;
      }
      if (ctx?.snapshots) {
        for (const [k, prev] of Object.entries(ctx.snapshots)) {
          const includeChecked = k === "shopping";
          utils.items.list.setData(
            { householdId, kind: k as never, includeChecked },
            prev as never
          );
        }
      }
      toast.error(e.message);
    },
    onSettled: () => {
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
    },
  });

  const adjustQty = trpc.items.adjustQuantity.useMutation({
    onMutate: async (vars) => {
      await utils.items.list.cancel({ householdId, kind: "pantry", includeChecked: false });
      const prev = utils.items.list.getData({ householdId, kind: "pantry", includeChecked: false });
      utils.items.list.setData(
        { householdId, kind: "pantry", includeChecked: false },
        (old) =>
          (old ?? []).map((it) =>
            it.id === vars.itemId ? { ...it, quantity: Math.max(0, it.quantity + vars.delta) } : it
          )
      );
      return { prev };
    },
    onSuccess: (data) => {
      if (data.promotedShoppingItemId) {
        toast.success("Hit low stock — added to shopping list automatically");
      }
    },
    onError: (e, vars, ctx) => {
      if (isTransientNetworkError(e)) {
        void enqueue("items.adjustQuantity", vars);
        toast.info("Saved offline — will sync when reconnected.");
        return;
      }
      if (ctx?.prev) {
        utils.items.list.setData(
          { householdId, kind: "pantry", includeChecked: false },
          ctx.prev
        );
      }
      toast.error(e.message);
    },
    onSettled: () => {
      void utils.items.list.invalidate();
      void utils.items.audit.invalidate();
    },
  });

  const shopping = shoppingQuery.data ?? [];
  const pantry = pantryQuery.data ?? [];
  const staples = staplesQuery.data ?? [];
  const expiring = expiringQuery.data ?? [];

  const matches = (item: { name: string }) => {
    return !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase());
  };

  const shoppingActive = useMemo(
    () => shopping.filter((i) => !i.checkedAt && matches(i)),
    [shopping, search]
  );
  const shoppingChecked = useMemo(
    () => shopping.filter((i) => i.checkedAt && matches(i)),
    [shopping, search]
  );
  const pantryFiltered = useMemo(
    () => pantry.filter((i) => matches(i)),
    [pantry, search]
  );
  const staplesFiltered = useMemo(
    () => staples.filter((i) => matches(i)),
    [staples, search]
  );

  const lowStock = useMemo(
    () =>
      pantry.filter(
        (i) => i.lowStockThreshold !== null && i.lowStockThreshold !== undefined && i.quantity <= (i.lowStockThreshold ?? 0)
      ),
    [pantry]
  );

  // Store-filtered shopping items
  const shoppingStoreItems = useMemo(() => {
    if (!storeFilter) return shoppingActive; // "All" — show everything
    return shoppingActive.filter((i) => i.storeSlug === storeFilter);
  }, [shoppingActive, storeFilter]);

  const shoppingGeneralItems = useMemo(() => {
    if (!storeFilter) return []; // "All" view doesn't need a separate General section
    return shoppingActive.filter((i) => !i.storeSlug);
  }, [shoppingActive, storeFilter]);

  const checkedStoreItems = useMemo(() => {
    if (!storeFilter) return shoppingChecked;
    return shoppingChecked.filter((i) => i.storeSlug === storeFilter || !i.storeSlug);
  }, [shoppingChecked, storeFilter]);

  const householdName = householdQuery.data?.household.name;

  function openAdd(kind: "shopping" | "pantry" | "staple") {
    setAddDefaultKind(kind);
    setAddOpen(true);
  }

  return (
    <AppShell title={householdName}>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <TabsList className="bg-card/80 backdrop-blur">
                <TabsTrigger value="shopping" className="gap-1.5">
                  <ShoppingBasket className="h-4 w-4" />
                  Shopping
                  {shoppingActive.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] px-1">
                      {shoppingActive.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pantry" className="gap-1.5">
                  <Refrigerator className="h-4 w-4" />
                  Pantry
                </TabsTrigger>
                <TabsTrigger value="staple" className="gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Staples
                </TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                {/* Use Button asChild + Link so the rendered DOM is a single <a>
                    styled as a button. Wrapping <Button> inside <Link> would
                    nest a <button> inside an <a>, which is invalid HTML. */}
                <Button asChild variant="outline" className="bg-card gap-1.5" title="Import a paper receipt">
                  <Link href="/receipts/new">
                    <Receipt className="h-4 w-4" />
                    <span className="hidden sm:inline">Import receipt</span>
                  </Link>
                </Button>
                <Button onClick={() => openAdd(tab)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Add to {tab === "shopping" ? "list" : tab === "pantry" ? "pantry" : "staples"}
                  </span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${tab === "shopping" ? "shopping list" : tab === "pantry" ? "pantry" : "staples"}…`}
                className="pl-9 bg-card/70 backdrop-blur"
              />
            </div>

            {tab === "shopping" && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setStoreFilter(null)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition ${
                    storeFilter === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/80 border-border hover:bg-card"
                  }`}
                >
                  All
                </button>
                {TEXAS_STORES.map((store) => (
                  <button
                    key={store.slug}
                    type="button"
                    onClick={() => setStoreFilter(store.slug)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full border transition"
                    style={
                      storeFilter === store.slug
                        ? { backgroundColor: store.color, color: "#fff", borderColor: store.color }
                        : undefined
                    }
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            )}

            <TabsContent value="shopping" className="mt-4 space-y-6">
              {shoppingActive.length === 0 && shoppingChecked.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBasket className="h-12 w-12 text-primary" />}
                  title={search ? "No matches" : "The list is empty"}
                  desc={search ? "Try a different search." : "Add the first thing you need from the store."}
                  action={!search ? <Button onClick={() => openAdd("shopping")}>Add an item</Button> : undefined}
                />
              ) : (
                <>
                  {/* Store items (or all items when storeFilter is null) */}
                  {storeFilter === null ? (
                    /* "All" view: show items grouped by store with badges */
                    <div className="space-y-2">
                      {shoppingStoreItems.map((it) => (
                        <ItemRow
                          key={it.id}
                          item={it}
                          showStoreBadge
                          onToggleCheck={(next) =>
                            setChecked.mutate({ itemId: it.id, checked: next })
                          }
                          onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                          onEdit={() => setEditItem(it as EditableItem)}
                          onDelete={() => softDelete.mutate({ itemId: it.id })}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Store-specific view: store items first, then General below */
                    <>
                      {shoppingStoreItems.length > 0 && (
                        <section className="space-y-2">
                          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: STORE_BY_SLUG[storeFilter]?.color }}
                            />
                            {STORE_BY_SLUG[storeFilter]?.name}
                            <span className="text-[11px] text-muted-foreground/70">· {shoppingStoreItems.length}</span>
                          </h3>
                          <div className="space-y-2">
                            {shoppingStoreItems.map((it) => (
                              <ItemRow
                                key={it.id}
                                item={it}
                                onToggleCheck={(next) =>
                                  setChecked.mutate({ itemId: it.id, checked: next })
                                }
                                onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                                onEdit={() => setEditItem(it as EditableItem)}
                                onDelete={() => softDelete.mutate({ itemId: it.id })}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                      {shoppingGeneralItems.length > 0 && (
                        <section className="space-y-2">
                          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                            General
                            <span className="text-[11px] text-muted-foreground/70">· {shoppingGeneralItems.length}</span>
                          </h3>
                          <div className="space-y-2">
                            {shoppingGeneralItems.map((it) => (
                              <ItemRow
                                key={it.id}
                                item={it}
                                onToggleCheck={(next) =>
                                  setChecked.mutate({ itemId: it.id, checked: next })
                                }
                                onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                                onEdit={() => setEditItem(it as EditableItem)}
                                onDelete={() => softDelete.mutate({ itemId: it.id })}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                      {shoppingStoreItems.length === 0 && shoppingGeneralItems.length === 0 && (
                        <EmptyState
                          icon={<ShoppingBasket className="h-12 w-12 text-primary" />}
                          title="Nothing here yet"
                          desc={`No items for ${STORE_BY_SLUG[storeFilter]?.name ?? "this store"}. Add one!`}
                          action={<Button onClick={() => openAdd("shopping")}>Add an item</Button>}
                        />
                      )}
                    </>
                  )}

                  {checkedStoreItems.length > 0 && (
                    <details className="tactile p-4">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Checked off ({checkedStoreItems.length})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {checkedStoreItems.map((it) => (
                          <ItemRow
                            key={it.id}
                            item={it}
                            onToggleCheck={(next) =>
                              setChecked.mutate({ itemId: it.id, checked: next })
                            }
                            onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                            onEdit={() => setEditItem(it as EditableItem)}
                            onDelete={() => softDelete.mutate({ itemId: it.id })}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="pantry" className="mt-4 space-y-6">
              {pantryFiltered.length === 0 ? (
                <EmptyState
                  icon={<Refrigerator className="h-12 w-12 text-primary" />}
                  title={search ? "No matches" : "Your pantry is empty"}
                  desc={search ? "Try a different search." : "Add what's in your fridge and cupboards to track expiry and stock."}
                  action={!search ? <Button onClick={() => openAdd("pantry")}>Add to pantry</Button> : undefined}
                />
              ) : (
                <div className="space-y-2">
                  {pantryFiltered.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      onAdjustQuantity={(delta) =>
                        adjustQty.mutate({ itemId: it.id, delta })
                      }
                      onPromote={() => promote.mutate({ itemId: it.id })}
                      onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                      onEdit={() => setEditItem(it as EditableItem)}
                      onDelete={() => softDelete.mutate({ itemId: it.id })}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="staple" className="mt-4 space-y-6">
              {staplesFiltered.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-12 w-12 text-primary" />}
                  title={search ? "No matches" : "No staples yet"}
                  desc={search ? "Try a different search." : "Set things you regularly buy as staples — milk, bread, paper towels — for one-tap re-add."}
                  action={!search ? <Button onClick={() => openAdd("staple")}>Add a staple</Button> : undefined}
                />
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {staplesFiltered.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      onPromote={() => promote.mutate({ itemId: it.id })}
                      onShowPrices={() => setPriceItem({ id: it.id, name: it.name })}
                      onEdit={() => setEditItem(it as EditableItem)}
                      onDelete={() => softDelete.mutate({ itemId: it.id })}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <div className="tactile p-4 space-y-3">
            <h2 className="font-display text-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent-foreground" />
              Expiring soon
            </h2>
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing expires in the next 3 days.</p>
            ) : (
              <ul className="space-y-2">
                {expiring.slice(0, 6).map((it) => {
                  const days = Math.ceil(((it.expiresAt ?? 0) - Date.now()) / 86_400_000);
                  return (
                    <li key={it.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{it.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {days < 0 ? `Expired` : days === 0 ? `Today` : `In ${days}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {lowStock.length > 0 && (
            <div className="tactile p-4 space-y-3">
              <h2 className="font-display text-lg flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-secondary" />
                Running low
              </h2>
              <ul className="space-y-2">
                {lowStock.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{it.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-card"
                      onClick={() => promote.mutate({ itemId: it.id })}
                    >
                      Add to list
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="tactile p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-muted-foreground" />
                Activity
              </h2>
              <Link
                href={`/households/${householdId}/audit`}
                className="text-xs text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {auditQuery.data && auditQuery.data.length > 0 ? (
              <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {auditQuery.data.slice(0, 12).map((a) => (
                  <li key={a.id} className="text-sm leading-snug">
                    <span>{a.summary}</span>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </aside>
      </div>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        householdId={householdId}
        defaultKind={addDefaultKind}
        defaultStoreSlug={storeFilter}
      />
      <PriceHistoryDialog
        open={priceItem !== null}
        onOpenChange={(o) => !o && setPriceItem(null)}
        itemId={priceItem?.id ?? null}
        itemName={priceItem?.name}
      />
      <EditItemDialog
        open={editItem !== null}
        onOpenChange={(o) => !o && setEditItem(null)}
        item={editItem}
      />
    </AppShell>
  );
}


function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="bg-card/60 backdrop-blur tactile">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="font-display text-xl">{title}</EmptyTitle>
        <EmptyDescription>{desc}</EmptyDescription>
      </EmptyHeader>
      {action && <div className="mt-2">{action}</div>}
    </Empty>
  );
}
