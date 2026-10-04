import { permissionCodes } from "@bcis/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createUser, listRoles, listUsers, setRolePermissions, setUserActive, setUserRoles, type SecurityRole, type SecurityUser } from "@/lib/api-client";

const newUserSchema = z.object({ username: z.string().trim().min(3, "Use at least 3 characters.").max(100), displayName: z.string().trim().min(2, "Use at least 2 characters.").max(150), password: z.string().min(12, "Use at least 12 characters.").max(256), role: z.string().min(1, "Select a role.") });
type NewUserForm = z.infer<typeof newUserSchema>;

export function SecurityAdminPanel({ token, mode, onSignOut }: { token: string; mode: "users" | "roles"; onSignOut: () => Promise<void> }) {
  const [users, setUsers] = useState<SecurityUser[]>([]);
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextUsers, nextRoles] = await Promise.all([listUsers(token), listRoles(token)]);
      setUsers(nextUsers);
      setRoles(nextRoles);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { await onSignOut(); return; }
      setError(caught instanceof ApiError ? caught.message : "Security records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [onSignOut, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <div className="rounded-xl border bg-surface p-8 text-sm text-muted-foreground">Loading security records…</div>;
  if (error) return <div className="rounded-xl border bg-surface p-8"><p className="text-sm text-danger">{error}</p><Button className="mt-4" onClick={() => void refresh()} variant="outline">Retry</Button></div>;

  return mode === "users"
    ? <UserPanel token={token} users={users} roles={roles} onChanged={refresh} />
    : <RolePanel token={token} roles={roles} onChanged={refresh} />;
}

function UserPanel({ token, users, roles, onChanged }: { token: string; users: SecurityUser[]; roles: SecurityRole[]; onChanged: () => Promise<void> }) {
  const form = useForm<NewUserForm>({ resolver: zodResolver(newUserSchema), defaultValues: { username: "", displayName: "", password: "", role: roles[0]?.code ?? "" } });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ user: SecurityUser; kind: "active" | "roles" } | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(values: NewUserForm) {
    setMessage("");
    try {
      await createUser(token, { username: values.username, displayName: values.displayName, password: values.password, roles: [values.role] });
      form.reset({ username: "", displayName: "", password: "", role: roles[0]?.code ?? "" });
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : "The user could not be created.");
    }
  }

  async function confirmChange() {
    if (!pending || (pending.kind === "roles" && draftRoles.length === 0)) return;
    setBusy(true);
    setMessage("");
    try {
      if (pending.kind === "active") await setUserActive(token, pending.user.id, !pending.user.isActive);
      else await setUserRoles(token, pending.user.id, draftRoles);
      setPending(null);
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The user change failed.");
    } finally { setBusy(false); }
  }

  return <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
    <section className="min-w-0 rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Users</h2>{message && <p className="mt-3 text-sm text-danger" role="alert">{message}</p>}<div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">User</th><th>Roles</th><th>Status</th><th className="pr-4 text-right">Action</th></tr></thead><tbody>{users.map((user) => <tr className="border-t" key={user.id}><td className="px-4 py-3"><p className="font-medium">{user.displayName}</p><p className="text-xs text-muted-foreground">{user.username}</p></td><td>{user.roles.join(", ")}</td><td>{user.isActive ? "Active" : "Inactive"}</td><td className="pr-4 text-right"><div className="flex justify-end gap-2"><Button onClick={() => { setDraftRoles(user.roles); setPending({ user, kind: "roles" }); }} size="sm" variant="outline">Edit roles</Button><Button onClick={() => setPending({ user, kind: "active" })} size="sm" variant="outline">{user.isActive ? "Deactivate" : "Activate"}</Button></div></td></tr>)}</tbody></table></div></section>
    <form className="h-fit rounded-xl border bg-surface p-6" onSubmit={form.handleSubmit(submit)}><h2 className="font-semibold">New user</h2><div className="mt-4 space-y-4"><Field label="Display name"><Input aria-label="New user display name" autoComplete="name" maxLength={150} {...form.register("displayName")} />{form.formState.errors.displayName && <p className="text-xs text-danger">{form.formState.errors.displayName.message}</p>}</Field><Field label="Username"><Input aria-label="New user username" autoComplete="off" maxLength={100} {...form.register("username")} />{form.formState.errors.username && <p className="text-xs text-danger">{form.formState.errors.username.message}</p>}</Field><Field label="Temporary password"><Input aria-label="New user temporary password" autoComplete="new-password" maxLength={256} type="password" {...form.register("password")} />{form.formState.errors.password && <p className="text-xs text-danger">{form.formState.errors.password.message}</p>}</Field><Field label="Role"><select aria-label="New user role" className="h-10 w-full rounded-md border bg-background px-3 text-sm" {...form.register("role")}>{roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}</select>{form.formState.errors.role && <p className="text-xs text-danger">{form.formState.errors.role.message}</p>}</Field><Button className="w-full" disabled={form.formState.isSubmitting} type="submit" variant="accent">{form.formState.isSubmitting ? "Creating…" : "Create user"}</Button></div></form>
    <ConfirmationDialog open={Boolean(pending)} title={pending?.kind === "roles" ? "Confirm user roles?" : `Confirm ${pending?.user.isActive ? "deactivation" : "activation"}?`} description={pending?.kind === "roles" ? "The user's permissions will change immediately on the server. Ask them to sign in again to refresh their desktop navigation." : "The user's access will change immediately on the server."} details={pending?.kind === "roles" ? <div className="grid gap-2">{roles.map((role) => <label className="flex items-center gap-2" key={role.id}><input checked={draftRoles.includes(role.code)} onChange={(event) => setDraftRoles((current) => event.target.checked ? [...current, role.code] : current.filter((code) => code !== role.code))} type="checkbox" />{role.name}</label>)}{draftRoles.length === 0 && <p className="text-danger">Select at least one role.</p>}</div> : pending?.user.displayName} confirmLabel={pending?.kind === "roles" ? "Save roles" : pending?.user.isActive ? "Deactivate user" : "Activate user"} destructive={pending?.kind === "active" && pending.user.isActive} busy={busy} onConfirm={() => void confirmChange()} onCancel={() => setPending(null)} />
  </div>;
}

function RolePanel({ token, roles, onChanged }: { token: string; roles: SecurityRole[]; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<{ role: SecurityRole; permissions: string[]; changed: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirmChange() {
    if (!pending) return;
    setBusy(true); setError("");
    try { await setRolePermissions(token, pending.role.id, pending.permissions); setPending(null); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The permission change failed."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Roles and permissions</h2><p className="mt-1 text-sm text-muted-foreground">Changes are enforced by the API and audited. Affected users should sign in again to refresh their desktop navigation.</p>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-5 space-y-5">{roles.map((role) => <div className="rounded-lg border p-4" key={role.id}><h3 className="font-medium">{role.name}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionCodes.map((permission) => <label className="flex items-center gap-2 text-xs" key={permission}><input checked={role.permissions.includes(permission)} onChange={(event) => { const next = event.target.checked ? [...role.permissions, permission] : role.permissions.filter((code) => code !== permission); setPending({ role, permissions: next, changed: permission }); }} type="checkbox" />{permission}</label>)}</div></div>)}</div><ConfirmationDialog open={Boolean(pending)} title="Confirm role permission change?" description="This changes server-authoritative permissions for every user with this role." details={pending ? `${pending.role.name}: ${pending.changed} → ${pending.permissions.includes(pending.changed) ? "grant" : "remove"}` : undefined} confirmLabel="Save permission" destructive={Boolean(pending && !pending.permissions.includes(pending.changed))} busy={busy} onConfirm={() => void confirmChange()} onCancel={() => setPending(null)} /></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
