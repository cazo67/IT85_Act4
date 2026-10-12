// Dev aid: attach to a running client, optionally click sidebar/buttons by name (DOM clicks, NOT used for recording), print an aria snapshot.
import { createRequire } from "node:module";
import { join } from "node:path";
import { root, loadSecrets } from "./lib/common.mjs";
const { chromium } = createRequire(join(root, "source", "package.json"))("playwright-core");
const [port, ...steps] = process.argv.slice(2);
const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); const page = b.contexts()[0].pages()[0];
for (const st of steps) {
  if (st.startsWith("login:")) { const sec = loadSecrets(); const u = sec.byRole[st.slice(6)]; const pw = st.slice(6) === "owner" ? sec.ownerPassword : sec.users[u].password; await page.getByLabel("Username").fill(u); await page.getByLabel("Password").fill(pw); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(2500); }
  else if (st.startsWith("click:")) { await page.getByRole("button", { name: st.slice(6), exact: true }).first().click(); await page.waitForTimeout(900); }
  else if (st.startsWith("fill:")) { const [l, v] = st.slice(5).split("="); await page.getByLabel(l).or(page.getByPlaceholder(l)).first().fill(v); await page.waitForTimeout(300); }
  else if (st.startsWith("shot:")) await page.screenshot({ path: st.slice(5) });
}
const snap = await page.locator("main, body").first().ariaSnapshot();
console.log(snap.split("\n").slice(0, Number(process.env.LINES ?? 140)).join("\n"));
await b.close();
