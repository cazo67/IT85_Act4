import { LockKeyhole } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, unlockSession, type AuthenticatedUser } from "@/lib/api-client";

export function LockScreen({ token, user, onUnlocked, onSignOut }: { token: string; user: AuthenticatedUser; onUnlocked: (user: AuthenticatedUser) => void; onSignOut: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock() {
    setSubmitting(true);
    setError("");
    try {
      onUnlocked(await unlockSession(token, password));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The server is unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-primary px-6 text-primary-foreground">
      <section className="w-full max-w-sm rounded-xl bg-surface p-8 text-foreground shadow-xl">
        <LockKeyhole className="mx-auto size-9 text-accent" />
        <h1 className="mt-4 text-center text-xl font-semibold">Session locked</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{user.displayName}</p>
        <div className="mt-6 space-y-2"><Label htmlFor="unlock-password">Password</Label><Input id="unlock-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void unlock()} /></div>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        <Button className="mt-5 w-full" disabled={submitting || !password} onClick={() => void unlock()} size="lg" variant="accent">{submitting ? "Unlocking…" : "Unlock"}</Button>
        <Button className="mt-2 w-full" onClick={onSignOut} variant="ghost">Sign out instead</Button>
      </section>
    </main>
  );
}

