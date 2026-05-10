import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Bell,
  Copy,
  KeyRound,
  Lock,
  Refrigerator,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getCurrentPushEndpoint,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import type { KioskPermissions } from "../../../drizzle/schema";

const DEFAULT_KIOSK: KioskPermissions = {
  view: true,
  add: true,
  check: true,
  edit: false,
  delete: false,
};

export function SettingsPage({ householdId }: { householdId: number }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const householdQuery = trpc.households.get.useQuery({ householdId });
  const invitesQuery = trpc.invites.list.useQuery({ householdId });

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState<KioskPermissions>(DEFAULT_KIOSK);
  const [lowStockThreshold, setLowStockThreshold] = useState(1);

  useEffect(() => {
    if (!householdQuery.data) return;
    const h = householdQuery.data.household;
    setName(h.name);
    setPin(h.kioskPin ?? "");
    setPermissions((h.kioskPermissions as KioskPermissions) ?? DEFAULT_KIOSK);
    setLowStockThreshold(h.lowStockThreshold ?? 1);
  }, [householdQuery.data]);

  const update = trpc.households.update.useMutation({
    onSuccess: async () => {
      toast.success("Settings saved");
      await utils.households.get.invalidate({ householdId });
      await utils.households.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createInvite = trpc.invites.create.useMutation({
    onSuccess: () => {
      toast.success("Invite created");
      void utils.invites.list.invalidate({ householdId });
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked");
      void utils.invites.list.invalidate({ householdId });
    },
  });

  const leave = trpc.households.leave.useMutation({
    onSuccess: () => {
      toast.success("You left the household");
      void utils.households.list.invalidate();
      setLocation("/");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMember = trpc.households.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      void utils.households.get.invalidate({ householdId });
    },
    onError: (e) => toast.error(e.message),
  });

  const transferOwner = trpc.households.transferOwner.useMutation({
    onSuccess: () => {
      toast.success("Ownership transferred");
      void utils.households.get.invalidate({ householdId });
      void utils.households.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const setRole = trpc.households.setRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      void utils.households.get.invalidate({ householdId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!householdQuery.data) {
    return (
      <AppShell>
        <div className="text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  const { household, membership, members } = householdQuery.data;
  const canManage = membership.role === "owner" || membership.role === "admin";

  function saveBasics() {
    update.mutate({
      householdId,
      name: name.trim() || undefined,
      lowStockThreshold,
    });
  }

  function saveKiosk() {
    if (pin && !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be 4 digits");
      return;
    }
    update.mutate({
      householdId,
      kioskPin: pin || null,
      kioskPermissions: permissions,
    });
  }

  function generateInvite() {
    createInvite.mutate({
      householdId,
      role: "member",
      ttlDays: 14,
      origin: window.location.origin,
    });
  }

  return (
    <AppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="max-w-3xl space-y-2">
        <h1 className="font-display text-3xl">{household.name}</h1>
        <p className="text-sm text-muted-foreground">
          Manage household settings, members, and the fridge kiosk.
        </p>
      </div>

      <Tabs defaultValue="general" className="mt-6 max-w-3xl">
        <TabsList className="bg-card/80 backdrop-blur">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-1.5" /> Members
          </TabsTrigger>
          <TabsTrigger value="kiosk">
            <Refrigerator className="h-4 w-4 mr-1.5" /> Fridge kiosk
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-1.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="account">
            <Lock className="h-4 w-4 mr-1.5" /> Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <div className="tactile p-6 space-y-4">
            <h2 className="font-display text-xl">Household</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="hname">Name</Label>
              <Input
                id="hname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                maxLength={80}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lst">Default low-stock threshold</Label>
              <Input
                id="lst"
                type="number"
                min={0}
                max={99}
                value={lowStockThreshold}
                onChange={(e) =>
                  setLowStockThreshold(Math.max(0, Math.min(99, Number(e.target.value) || 0)))
                }
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">
                Pantry items at or below this quantity will appear in "Running low".
              </p>
            </div>
            {canManage && (
              <Button onClick={saveBasics} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>

          <div className="tactile p-6 space-y-3">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-muted-foreground" />
              Recently deleted
            </h2>
            <p className="text-sm text-muted-foreground">
              Items soft-deleted within the last 30 days can be restored.
            </p>
            <Button variant="outline" className="bg-card" onClick={() => setLocation(`/households/${householdId}/trash`)}>
              Open trash
            </Button>
          </div>

          {membership.role !== "owner" && (
            <div className="tactile p-6 space-y-3 border border-destructive/20">
              <h2 className="font-display text-xl text-destructive">Leave household</h2>
              <p className="text-sm text-muted-foreground">
                You'll lose access to this household's lists and pantry.
              </p>
              <Button
                variant="outline"
                className="bg-card text-destructive border-destructive/30"
                onClick={() => {
                  if (confirm(`Leave "${household.name}"?`)) leave.mutate({ householdId });
                }}
              >
                Leave
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="mt-4 space-y-4">
          <div className="tactile p-6 space-y-3">
            <h2 className="font-display text-xl">Members</h2>
            <p className="text-xs text-muted-foreground">
              Only members of this household are visible. Each household is fully isolated from the others.
            </p>
            <ul className="divide-y divide-border/60">
              {members.map((m) => {
                const isSelf = m.userId === user?.id;
                const isOwner = membership.role === "owner";
                const isAdmin = membership.role === "admin" || isOwner;
                return (
                  <li key={m.id} className="py-3 flex items-center gap-3 flex-wrap">
                    <div className="h-9 w-9 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-display">
                      {(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {m.name ?? m.email}
                        {isSelf && <span className="text-muted-foreground"> (you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.role}
                    </span>
                    {!isSelf && isAdmin && m.role !== "owner" && (
                      <div className="flex items-center gap-1">
                        {isOwner && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => {
                                if (confirm(`Transfer ownership of "${household.name}" to ${m.name ?? m.email}? You will become an admin.`)) {
                                  transferOwner.mutate({ householdId, toUserId: m.userId });
                                }
                              }}
                              disabled={transferOwner.isPending}
                              title="Make this person the owner"
                            >
                              Make owner
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() =>
                                setRole.mutate({
                                  householdId,
                                  userId: m.userId,
                                  role: m.role === "admin" ? "member" : "admin",
                                })
                              }
                              disabled={setRole.isPending}
                              title={m.role === "admin" ? "Demote to member" : "Promote to admin"}
                            >
                              {m.role === "admin" ? "Make member" : "Make admin"}
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${m.name ?? m.email} from "${household.name}"?`)) {
                              removeMember.mutate({ householdId, userId: m.userId });
                            }
                          }}
                          disabled={removeMember.isPending}
                          title="Remove from household"
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {canManage && (
            <div className="tactile p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl">Invitations</h2>
                <Button onClick={generateInvite} disabled={createInvite.isPending}>
                  Generate invite
                </Button>
              </div>
              {createInvite.data && (
                <InvitePreview
                  code={createInvite.data.code}
                  joinUrl={createInvite.data.joinUrl}
                  qrDataUrl={createInvite.data.qrDataUrl}
                  expiresAt={createInvite.data.expiresAt}
                />
              )}
              <ul className="divide-y divide-border/60 mt-2">
                {(invitesQuery.data ?? []).map((inv) => {
                  const used = Boolean(inv.consumedAt);
                  const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
                  return (
                    <li key={inv.id} className="py-3 flex items-center gap-3">
                      <code className="font-mono text-sm bg-muted/60 px-2 py-1 rounded">{inv.code}</code>
                      <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                        {used ? "Used" : expired ? "Expired" : `Expires ${inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "never"}`}
                        {inv.email && ` · ${inv.email}`}
                      </div>
                      {!used && !expired && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => revokeInvite.mutate({ householdId, inviteId: inv.id })}
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kiosk" className="mt-4 space-y-4">
          <div className="tactile p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Refrigerator className="h-7 w-7 text-primary" />
              <div>
                <h2 className="font-display text-xl">Family Hub kiosk</h2>
                <p className="text-sm text-muted-foreground">
                  Set a 4-digit PIN, then bookmark the kiosk URL on the fridge browser.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pin" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Kiosk PIN (4 digits)
              </Label>
              <Input
                id="pin"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                disabled={!canManage}
                placeholder="0000"
                className="font-mono text-2xl tracking-[0.5em] text-center max-w-[10rem]"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to disable kiosk access.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Kiosk permissions</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                What can someone do at the fridge after entering the PIN?
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-1">
                <PermissionRow label="View lists & pantry" value={permissions.view} disabled />
                <PermissionRow label="Add items" value={permissions.add} onChange={(v) => setPermissions({ ...permissions, add: v })} disabledControl={!canManage} />
                <PermissionRow label="Check off items" value={permissions.check} onChange={(v) => setPermissions({ ...permissions, check: v })} disabledControl={!canManage} />
                <PermissionRow label="Edit items" value={permissions.edit} onChange={(v) => setPermissions({ ...permissions, edit: v })} disabledControl={!canManage} />
                <PermissionRow label="Delete items" value={permissions.delete} onChange={(v) => setPermissions({ ...permissions, delete: v })} disabledControl={!canManage} />
              </div>
            </div>

            {canManage && (
              <Button onClick={saveKiosk} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save kiosk settings"}
              </Button>
            )}

            {pin && (
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
                <div className="font-medium">Kiosk URL</div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-card px-2 py-1 rounded flex-1 truncate">
                    {window.location.origin}/households/{householdId}/kiosk
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/households/${householdId}/kiosk`);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open this on the Family Hub browser, enter the PIN, and add to bookmarks.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <div className="tactile p-6 space-y-4">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Bell className="h-5 w-5" /> Push notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Enable notifications for this device. You can fine-tune which triggers send pushes after enabling.
            </p>
            <NotificationSetup householdId={householdId} />
          </div>
        </TabsContent>

        <TabsContent value="account" className="mt-4">
          <ChangePasswordSection />
        </TabsContent>
      </Tabs>

    </AppShell>
  );
}

function PermissionRow({
  label,
  value,
  onChange,
  disabled,
  disabledControl,
}: {
  label: string;
  value: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  disabledControl?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 p-3">
      <span className="text-sm">{label}</span>
      <Switch
        checked={value}
        onCheckedChange={(v) => onChange?.(Boolean(v))}
        disabled={disabled || disabledControl}
      />
    </div>
  );
}

function InvitePreview({
  code,
  joinUrl,
  qrDataUrl,
  expiresAt,
}: {
  code: string;
  joinUrl: string;
  qrDataUrl: string;
  expiresAt: Date;
}) {
  return (
    <div className="rounded-xl bg-secondary/10 border border-secondary/20 p-4 grid sm:grid-cols-[auto_1fr] gap-4 items-center">
      <img src={qrDataUrl} alt="Join QR" className="h-32 w-32 rounded-lg bg-card p-2" />
      <div className="space-y-2">
        <div>
          <div className="text-xs text-muted-foreground">Code</div>
          <code className="font-mono text-2xl tracking-[0.3em]">{code}</code>
        </div>
        <div className="flex items-center gap-2">
          <Input value={joinUrl} readOnly className="text-xs bg-card" />
          <Button
            size="sm"
            variant="outline"
            className="bg-card"
            onClick={() => {
              void navigator.clipboard.writeText(joinUrl);
              toast.success("Link copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Expires {new Date(expiresAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

type PushPrefs = {
  itemAdded: boolean;
  itemChecked: boolean;
  expiringSoon: boolean;
  expired: boolean;
};

const TRIGGERS: Array<{ key: keyof PushPrefs; label: string; help: string }> = [
  { key: "itemAdded", label: "Item added", help: "When someone adds to a shared list" },
  { key: "itemChecked", label: "Item checked off", help: "When an item you added is purchased" },
  { key: "expiringSoon", label: "Expiring soon", help: "Pantry items within 3 days of expiry" },
  { key: "expired", label: "Expired", help: "Pantry items past their expiry date" },
];

function NotificationSetup({ householdId }: { householdId: number }) {
  const supported = isPushSupported();
  const statusQuery = trpc.push.status.useQuery(undefined, { enabled: supported });
  const myDevices = trpc.push.listMine.useQuery({ householdId }, { enabled: supported });
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();
  const updatePrefs = trpc.push.updatePrefs.useMutation();
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentPushEndpoint().then(setEndpoint);
  }, []);

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser does not support push notifications. On iOS, install Pantri to your
        home screen first (Share → Add to Home Screen) and try again.
      </p>
    );
  }

  const vapidConfigured = statusQuery.data?.vapidConfigured ?? false;
  const vapidKey = statusQuery.data?.vapidPublicKey ?? null;
  const thisDevice = myDevices.data?.find((d) => d.endpoint === endpoint);
  const otherDevices = (myDevices.data ?? []).filter((d) => d.endpoint !== endpoint);

  async function enable() {
    setBusy(true);
    try {
      const payload = await subscribeToPush(vapidKey);
      if (!payload) {
        toast.info("Push not yet active on the server.");
        return;
      }
      await subscribe.mutateAsync({
        householdId,
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        authKey: payload.authKey,
        deviceLabel: navigator.userAgent.slice(0, 60),
      });
      setEndpoint(payload.endpoint);
      await utils.push.listMine.invalidate({ householdId });
      toast.success("Notifications enabled on this device.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const removed = await unsubscribeFromPush();
      if (removed) {
        await unsubscribe.mutateAsync({ endpoint: removed });
      }
      setEndpoint(null);
      await utils.push.listMine.invalidate({ householdId });
      toast.success("Disabled on this device.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(deviceEndpoint: string, currentPrefs: PushPrefs, key: keyof PushPrefs) {
    const next = { ...currentPrefs, [key]: !currentPrefs[key] };
    await updatePrefs.mutateAsync({ endpoint: deviceEndpoint, prefs: next });
    await utils.push.listMine.invalidate({ householdId });
  }

  return (
    <div className="space-y-4">
      {!vapidConfigured && (
        <div className="rounded-lg bg-muted/40 border border-border/60 p-3 text-xs text-muted-foreground">
          The server hasn't been issued VAPID keys yet, so pushes can't be delivered.
          The opt-in is recorded and will activate automatically once the keys are set.
          (See TRANSFER.md §14.)
        </div>
      )}

      {endpoint && thisDevice ? (
        <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">This device</p>
              <p className="text-xs text-muted-foreground">{thisDevice.deviceLabel ?? "Unnamed"}</p>
            </div>
            <Button variant="outline" className="bg-card" size="sm" onClick={disable} disabled={busy}>
              {busy ? "Disabling…" : "Disable"}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Send me notifications for…
            </p>
            {TRIGGERS.map((t) => (
              <label
                key={t.key}
                className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/40 cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.help}</p>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary cursor-pointer"
                  checked={(thisDevice.prefs as PushPrefs)[t.key]}
                  onChange={() =>
                    togglePref(thisDevice.endpoint, thisDevice.prefs as PushPrefs, t.key)
                  }
                  disabled={updatePrefs.isPending}
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <Button onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Enable on this device"}
        </Button>
      )}

      {otherDevices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Other devices subscribed
          </p>
          {otherDevices.map((d) => {
            const prefs = d.prefs as PushPrefs;
            const enabled = TRIGGERS.filter((t) => prefs[t.key]).length;
            return (
              <div
                key={d.id}
                className="rounded-lg border border-border/40 p-3 flex items-center justify-between gap-2 bg-card/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.deviceLabel ?? "Unnamed device"}</p>
                  <p className="text-xs text-muted-foreground">
                    {enabled} of {TRIGGERS.length} triggers enabled
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Remove this device subscription?")) return;
                    await unsubscribe.mutateAsync({ endpoint: d.endpoint });
                    await utils.push.listMine.invalidate({ householdId });
                  }}
                >
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const hasPasswordQuery = trpc.auth.hasPassword.useQuery();
  const hasPassword = hasPasswordQuery.data?.hasPassword ?? false;

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success(hasPassword ? "Password updated" : "Password set");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      void hasPasswordQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    changePassword.mutate({
      currentPassword: hasPassword ? currentPassword : undefined,
      newPassword,
    });
  }

  return (
    <div className="tactile p-6 space-y-4">
      <h2 className="font-display text-xl flex items-center gap-2">
        <Lock className="h-5 w-5" /> {hasPassword ? "Change password" : "Set a password"}
      </h2>
      {!hasPassword && (
        <p className="text-sm text-muted-foreground">
          You signed in with a magic link. Set a password so you can sign in on any device without email.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="currentPw">Current password</Label>
            <Input
              id="currentPw"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="newPw">{hasPassword ? "New password" : "Password"}</Label>
          <Input
            id="newPw"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPw">Confirm password</Label>
          <Input
            id="confirmPw"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Saving…" : hasPassword ? "Update password" : "Set password"}
        </Button>
      </form>
    </div>
  );
}
