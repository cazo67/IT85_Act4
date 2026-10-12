import { call, login, loadSecrets } from "./lib/common.mjs";
const s = loadSecrets(); const o = await login("demo.owner", s.ownerPassword);
const u = await call("GET", "/users", { token: o.token });
console.log(JSON.stringify((u.items ?? u).map((x) => ({ u: x.username, active: x.isActive, roles: x.roles })), null, 0), "\nsaved:", Object.keys(s.users ?? {}));
