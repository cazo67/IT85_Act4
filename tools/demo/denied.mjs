// Real authenticated request as the Cashier to an admin-only endpoint. Prints only role, method, path, status and error code. Never prints credentials or tokens.
import { API, loadSecrets } from "./lib/common.mjs";

const s = loadSecrets();
const username = s.byRole.cashier;
const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: s.users[username].password }) });
const session = (await login.json()).data;
const response = await fetch(`${API}/users`, { headers: { authorization: `Bearer ${session.token ?? session.sessionToken}` } });
const body = await response.json().catch(() => ({}));
console.log(`role      : ${session.user.roles.join(", ")}`);
console.log(`request   : GET /api/v1/users   (admin-only: user.manage)`);
console.log(`status    : ${response.status} ${response.statusText || ""}`.trimEnd());
console.log(`error code: ${body?.error?.code ?? "(none)"}`);
console.log(`message   : ${body?.error?.message ?? ""}`);
