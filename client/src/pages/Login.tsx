import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PantriWordmark } from "@/components/PantriWordmark";
import { Mail } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type State = "idle" | "loading" | "sent" | "error";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [, setLocation] = useLocation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      const resp = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await resp.json();

      if (!resp.ok) {
        setErrorMsg(body.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      // Dev shortcut: if the server returns a _devLink (no Resend configured), follow it
      if (body._devLink) {
        window.location.href = body._devLink;
        return;
      }

      setState("sent");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <PantriWordmark asImage={false} size="xl" className="text-primary justify-center" />
          <p className="mt-2 text-muted-foreground">Your household, stocked.</p>
        </div>

        {state === "sent" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3 shadow-sm">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-display text-xl font-semibold">Check your inbox</h2>
            <p className="text-muted-foreground text-sm">
              We sent a login link to <strong>{email}</strong>. Click it to sign in — it expires in 15 minutes.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { setState("idle"); setEmail(""); }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-8 space-y-5 shadow-sm">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold">Sign in</h2>
              <p className="text-sm text-muted-foreground">We'll email you a magic link — no password needed.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={state === "loading"}
              />
            </div>

            {state === "error" && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            <Button type="submit" className="w-full" disabled={state === "loading"}>
              {state === "loading" ? "Sending…" : "Send login link"}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          New to Pantri? Just enter your email above — we'll create your account automatically.
        </p>
      </div>
    </div>
  );
}
