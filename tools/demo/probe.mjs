import { call, login, loadSecrets } from "./lib/common.mjs";
const s = loadSecrets(); const t = (await login("demo.administrator", s.users["demo.administrator"].password)).token;
const sh = (v, d = 0) => v === null || typeof v !== "object" ? typeof v : Array.isArray(v) ? `[${v.length}]` + (v.length && d < 2 ? sh(v[0], d + 1) : "") : "{" + Object.keys(v).slice(0, 14).map((k) => k + ":" + (d < 1 ? sh(v[k], d + 1) : typeof v[k])).join(",") + "}";
const plans = await call("GET", "/plans", { token: t }); console.log("plans", sh(plans));
const list = await call("GET", "/subscribers?search=Mara", { token: t }); console.log("subs", sh(list));
const id = (list.items ?? list)[0]?.id; if (id) console.log("profile", sh(await call("GET", `/subscribers/${id}`, { token: t })));
const o = await login("demo.supervisor", s.users["demo.supervisor"].password); console.log("setup", sh(await call("GET", "/collection-setup", { token: o.token })));
const inv = await call("GET", "/invoices?page=1&pageSize=1", { token: t }); console.log("invoices", sh(inv));
