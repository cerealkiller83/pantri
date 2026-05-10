import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PantriWordmark } from "@/components/PantriWordmark";
import { useState } from "react";

type Mode = "login" | "register";
type State = "idle" | "loading" | "error";

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload: Record<string, string> = {
      email: email.trim(),
      password,
    };
    if (mode === "register" && name.trim()) {
      payload.name = name.trim();
    }

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await resp.json();

      if (!resp.ok) {
        setErrorMsg(body.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      // Session cookie set — redirect to app
      window.location.href = body.redirect || "/";
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

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-8 space-y-5 shadow-sm">
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-semibold">
              {mode === "login" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Enter your email and password."
                : "Set up your Pantri account."}
            </p>
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={state === "loading"}
              />
            </div>
          )}

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

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={state === "loading"}
            />
          </div>

          {state === "error" && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}

          <Button type="submit" className="w-full" disabled={state === "loading"}>
            {state === "loading"
              ? (mode === "login" ? "Signing in…" : "Creating account…")
              : (mode === "login" ? "Sign in" : "Create account")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New to Pantri?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => { setMode("register"); setState("idle"); setErrorMsg(""); }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => { setMode("login"); setState("idle"); setErrorMsg(""); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
