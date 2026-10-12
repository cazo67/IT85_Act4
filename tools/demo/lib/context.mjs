// Shared run context for chapters: native input, three clients, the card window, and visible window switches.
import { join } from "node:path";
import { Native, Recorder, Client } from "./desktop.mjs";
import { PORTS, hwnd } from "./clients.mjs";
import { runDir, sleep } from "./common.mjs";
import { pageOf } from "./session.mjs";
import { createRequire } from "node:module";
import { root } from "./common.mjs";
const { chromium } = createRequire(join(root, "source", "package.json"))("playwright-core");

export async function createContext(recName) {
  const native = new Native(); const rec = new Recorder(recName);
  const ctx = { native, rec, clients: {}, hw: {} };
  for (const n of ["A", "B", "C"]) { const c = await new Client({ name: n, port: PORTS[n], native, rec }).attach(); c.offset = { dx: 0, dy: 0 }; ctx.clients[n] = c; ctx.hw[n] = hwnd(n); }
  const edge = await chromium.connectOverCDP(`http://127.0.0.1:${PORTS.EDGE}`); ctx.edge = edge; ctx.edgePage = edge.contexts()[0].pages()[0]; ctx.hw.EDGE = hwnd("EDGE");
  ctx.show = async (n, why) => { const r = await native.send("foreground", { hwnd: ctx.hw[n], ...(n === "EDGE" ? {} : { minimize: ctx.hw.EDGE }) }); if (!r.now) await native.send("foreground", { hwnd: ctx.hw[n] }); rec.log({ ev: "switch", to: n, why }); await sleep(300); };
  ctx.preload = async (name) => { await ctx.edgePage.goto("file:///" + join(runDir, "assets", `${name}.html`).replace(/\\/g, "/")); ctx.loaded = name; };
  ctx.card = async (name, ms, why) => { if (ctx.loaded !== name) await ctx.preload(name); await ctx.show("EDGE", why ?? name); rec.log({ ev: "card", name, ms }); await sleep(ms); };
  ctx.nav = async (client, label) => client.click(client.page.getByRole("button", { name: label, exact: true }), `nav ${label}`);
  ctx.close = async () => { native.close(); await ctx.edge.close().catch(() => {}); for (const c of Object.values(ctx.clients)) await c.browser.close().catch(() => {}); };
  return ctx;
}
