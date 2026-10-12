import { call, login, loadSecrets, saveSecrets, runId } from "./lib/common.mjs";
import { randomBytes } from "node:crypto";

const s = loadSecrets();
const rnd = () => randomBytes(18).toString("base64url");
const roles = { "demo.administrator": ["ADMINISTRATOR", "Demo Administrator"], "demo.cashier": ["CASHIER", "Demo Cashier"], "demo.supervisor": ["COLLECTION_SUPERVISOR", "Demo Collection Supervisor"], "demo.accounting": ["ACCOUNTING_AUDITOR", "Demo Accounting Auditor"] };
s.users ??= {};

let owner = await login("demo.owner", s.ownerPassword);
if (owner.user?.mustChangePassword) {
  const fresh = rnd();
  await call("POST", "/auth/change-password", { token: owner.token, body: { currentPassword: s.ownerPassword, newPassword: fresh } });
  s.ownerPassword = fresh; saveSecrets(s);
  owner = await login("demo.owner", s.ownerPassword);
}
// An earlier interrupted run created "demo.admin" without keeping its password: deactivate that orphan.
const existing = await call("GET", "/users?search=demo.admin", { token: owner.token });
delete s.users["demo.admin"];
for (const u of (await call("GET", "/users?search=demo.", { token: owner.token })).items ?? []) if (["demo.admin", "demo.auditor"].includes(u.username) && u.isActive) await call("PATCH", `/users/${u.id}/active`, { token: owner.token, body: { isActive: false } });
for (const [username, [role, displayName]] of Object.entries(roles)) {
  if (s.users[username]) continue;
  const password = rnd();
  await call("POST", "/users", { token: owner.token, body: { username, displayName, password, roles: [role] } });
  const session = await login(username, password);
  if (session.user?.mustChangePassword) {
    const finalPassword = rnd();
    await call("POST", "/auth/change-password", { token: session.token, body: { currentPassword: password, newPassword: finalPassword } });
    s.users[username] = { password: finalPassword, role };
  } else s.users[username] = { password, role };
  saveSecrets(s);
}
const me = await call("GET", "/auth/me", { token: owner.token });
const perms = {};
for (const [username, info] of Object.entries(s.users)) {
  const sess = await login(username, info.password);
  perms[username] = { role: info.role, permissionCount: sess.user.permissions.length, roles: sess.user.roles };
}
console.log(JSON.stringify({ runId, owner: { roles: me.user?.roles ?? me.roles }, accounts: perms }, null, 1));
