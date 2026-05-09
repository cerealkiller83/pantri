import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PantriWordmark } from "@/components/PantriWordmark";
import { useActiveHousehold } from "@/contexts/HouseholdContext";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, MapPin, Refrigerator } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export function NewHousehold() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { setActiveHouseholdId } = useActiveHousehold();
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locating, setLocating] = useState(false);

  const create = trpc.households.create.useMutation({
    onSuccess: async ({ id }) => {
      toast.success("Household created");
      await utils.households.list.invalidate();
      setActiveHouseholdId(id);
      setLocation("/");
    },
    onError: (e) => toast.error(e.message),
  });

  function detectLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(4));
        setLongitude(pos.coords.longitude.toFixed(4));
        setLocating(false);
        toast.success("Location detected");
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || "Couldn't get location");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give your household a name");
      return;
    }
    create.mutate({
      name: name.trim(),
      latitude: latitude || undefined,
      longitude: longitude || undefined,
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container flex items-center gap-2 h-16" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="flex items-center">
          <PantriWordmark asImage={false} size="md" className="text-primary" />
        </Link>
      </header>

      <main className="flex-1 container max-w-xl py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="tactile p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Refrigerator className="h-8 w-8 text-primary" />
            <div>
              <h1 className="font-display text-2xl">Create a household</h1>
              <p className="text-sm text-muted-foreground">A workspace for your family.</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., The Tan Family"
                autoFocus
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                You can rename later. Other members will only see this label after they join.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Location (optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Used only by the fridge kiosk view to dim the screen after sunset. Never shared.
              </p>
              <div className="flex gap-2">
                <Input
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude"
                  className="flex-1"
                />
                <Input
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude"
                  className="flex-1"
                />
                <Button type="button" variant="outline" className="bg-card" onClick={detectLocation} disabled={locating}>
                  {locating ? "Locating…" : "Detect"}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={create.isPending} className="flex-1">
                {create.isPending ? "Creating…" : "Create household"}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
