// Short synthetic usernames / 12-character passwords keep on-camera typing within budget. Old long-named accounts are deactivated.
import { call, login, loadSecrets, saveSecrets } from "./lib/common.mjs";
import { randomBytes } from "node:crypto";

const s = loadSecrets();
const rnd = () => randomBytes(9).toString("base64url"); // 12 chars
let owner = await login("demo.owner", s.ownerPassword);
if (s.ownerPassword.length !== 12) {
  const fresh = rnd();
  await call("POST", "/auth/change-password", { token: owner.token, body: { currentPassword: s.ownerPassword, newPassword: fresh } });
  s.ownerPassword = fresh; saveSecrets(s); owner = await login("demo.owner", s.ownerPassword);
}
const wanted = { admin: ["adm.demo", "ADMINISTRATOR", "Demo Administrator"], cashier: ["csh.demo", "CASHIER", "Demo Cashier"], supervisor: ["sup.demo", "COLLECTION_SUPERVISOR", "Demo Collection Supervisor"], auditor: ["aud.demo", "ACCOUNTING_AUDITOR", "Demo Accounting Auditor"] };
s.byRole = { owner: "demo.owner", ...(s.byRole ?? {}) };
for (const [key, [username, role, displayName]] of Object.entries(wanted)) {
  if (s.users[username]) { s.byRole[key] = username; continue; }
  const password = rnd();
  await call("POST", "/users", { token: owner.token, body: { username, displayName, password, roles: [role] } });
  const first = await login(username, password);
  let finalPassword = password;
  if (first.user?.mustChangePassword) { finalPassword = rnd(); await call("POST", "/auth/change-password", { token: first.token, body: { currentPassword: password, newPassword: finalPassword } }); }
  s.users[username] = { password: finalPassword, role }; s.byRole[key] = username; saveSecrets(s);
}
const all = await call("GET", "/users", { token: owner.token });
for (const u of all.items ?? all) if (u.username.startsWith("demo.") && u.username !== "demo.owner" && u.isActive) await call("PATCH", `/users/${u.id}/active`, { token: owner.token, body: { isActive: false } });
for (const u of Object.keys(s.users)) if (u.startsWith("demo.")) delete s.users[u];
saveSecrets(s);
const out = {};
for (const [key, username] of Object.entries(s.byRole)) { const pw = key === "owner" ? s.ownerPassword : s.users[username].password; const sess = await login(username, pw); out[key] = { username, roles: sess.user.roles, permissions: sess.user.permissions.length, passwordLength: pw.length }; }
console.log(JSON.stringify(out));
