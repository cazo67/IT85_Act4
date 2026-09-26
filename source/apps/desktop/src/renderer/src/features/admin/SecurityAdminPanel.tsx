import { permissionCodes } from "@bcis/shared";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createUser, listRoles, listUsers, setRolePermissions, setUserActive, type SecurityRole, type SecurityUser } from "@/lib/api-client";

export function SecurityAdminPanel({ token, mode }: { token: string; mode: "users" | "roles" }) {
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
      setError(caught instanceof ApiError ? caught.message : "Security records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <div className="rounded-xl border bg-surface p-8 text-sm text-muted-foreground">Loading security records…</div>;
  if (error) return <div className="rounded-xl border bg-surface p-8"><p className="text-sm text-danger">{error}</p><Button className="mt-4" onClick={() => void refresh()} variant="outline">Retry</Button></div>;

  return mode === "users"
    ? <UserPanel token={token} users={users} roles={roles} onChanged={refresh} />
    : <RolePanel token={token} roles={roles} onChanged={refresh} />;
}

function UserPanel({ token, users, roles, onChanged }: { token: string; users: SecurityUser[]; roles: SecurityRole[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: roles[0]?.code ?? "" });
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await createUser(token, { username: form.username, displayName: form.displayName, password: form.password, roles: [form.role] });
      setForm({ username: "", displayName: "", password: "", role: roles[0]?.code ?? "" });
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : "The user could not be created.");
    }
  }

  return <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
    <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Users</h2><div className="mt-4 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">User</th><th>Roles</th><th>Status</th><th className="pr-4 text-right">Action</th></tr></thead><tbody>{users.map((user) => <tr className="border-t" key={user.id}><td className="px-4 py-3"><p className="font-medium">{user.displayName}</p><p className="text-xs text-muted-foreground">{user.username}</p></td><td>{user.roles.join(", ")}</td><td>{user.isActive ? "Active" : "Inactive"}</td><td className="pr-4 text-right"><Button onClick={async () => { await setUserActive(token, user.id, !user.isActive); await onChanged(); }} size="sm" variant="outline">{user.isActive ? "Deactivate" : "Activate"}</Button></td></tr>)}</tbody></table></div></section>
    <form className="h-fit rounded-xl border bg-surface p-6" onSubmit={submit}><h2 className="font-semibold">New user</h2><div className="mt-4 space-y-4"><Field label="Display name"><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field><Field label="Username"><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field><Field label="Temporary password"><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field><Field label="Role"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}</select></Field>{message && <p className="text-sm text-danger">{message}</p>}<Button className="w-full" type="submit" variant="accent">Create user</Button></div></form>
  </div>;
}

function RolePanel({ token, roles, onChanged }: { token: string; roles: SecurityRole[]; onChanged: () => Promise<void> }) {
  return <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Roles and permissions</h2><p className="mt-1 text-sm text-muted-foreground">Changes are enforced by the API and audited.</p><div className="mt-5 space-y-5">{roles.map((role) => <div className="rounded-lg border p-4" key={role.id}><h3 className="font-medium">{role.name}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionCodes.map((permission) => <label className="flex items-center gap-2 text-xs" key={permission}><input checked={role.permissions.includes(permission)} onChange={async (event) => { const next = event.target.checked ? [...role.permissions, permission] : role.permissions.filter((code) => code !== permission); await setRolePermissions(token, role.id, next); await onChanged(); }} type="checkbox" />{permission}</label>)}</div></div>)}</div></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
