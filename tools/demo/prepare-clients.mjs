// Starts owned clients A/B/C + card window, signs them in privately, light theme, full-screen on the primary display.
import { Native } from "./lib/desktop.mjs";
import { ensureClient, ensureEdge, hwnd, PORTS } from "./lib/clients.mjs";
import { pageOf, privateSignIn, setLightTheme } from "./lib/session.mjs";
import { sleep } from "./lib/common.mjs";

const roles = { A: "admin", B: "cashier", C: "auditor" };
const native = new Native();
for (const n of ["A", "B", "C"]) await ensureClient(n);
await ensureEdge();
for (const [n, role] of Object.entries(roles)) {
  const { browser, page } = await pageOf(PORTS[n]);
  if (process.argv.includes("--signin")) await privateSignIn(page, role);
  await setLightTheme(page).catch(() => {});
  await browser.close();
  const h = hwnd(n);
  await native.send("place", { hwnd: h }); await native.send("foreground", { hwnd: h }); await sleep(700);
  const fs = process.argv.includes("--fullscreen");
  if (fs) { await native.send("keys", { seq: "{F11}" }); await sleep(1500); }
  console.log(n, role, "hwnd", h);
}
console.log("edge hwnd", hwnd("EDGE"));
native.close(); process.exit(0);
