import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, changePassword, type AuthenticatedUser } from "@/lib/api-client";

export function ChangePasswordScreen({ token, onChanged, onSignOut }: { token: string; onChanged: (user: AuthenticatedUser) => void; onSignOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    setSubmitting(true);
    setError("");
    try {
      onChanged(await changePassword(token, currentPassword, newPassword));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The password could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-canvas px-6"><section className="w-full max-w-md rounded-xl border bg-surface p-8 shadow-sm"><h1 className="text-xl font-semibold">Create a private password</h1><p className="mt-2 text-sm text-muted-foreground">The bootstrap password is temporary. Change it before entering BCIS.</p><div className="mt-6 space-y-4"><Field label="Current password"><Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field><Field label="New password (12+ characters)"><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field><Field label="Confirm new password"><Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>{error && <p className="text-sm text-danger">{error}</p>}<Button className="w-full" disabled={submitting || newPassword.length < 12} onClick={() => void submit()} size="lg" variant="accent">{submitting ? "Changing…" : "Change password"}</Button><Button className="w-full" onClick={onSignOut} variant="ghost">Sign out</Button></div></section></main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
