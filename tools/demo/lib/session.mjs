// Private (unrecorded) session setup between chapters: DOM-driven sign-in/out, theme, full-screen. Documented in the manifest as setup, never as on-camera action.
import { createRequire } from "node:module";
import { join } from "node:path";
import { root, loadSecrets, sleep } from "./common.mjs";
import { PORTS } from "./clients.mjs";
const { chromium } = createRequire(join(root, "source", "package.json"))("playwright-core");

export async function pageOf(port) { const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); return { browser: b, page: b.contexts()[0].pages()[0] }; }

export function credentials(role) { const s = loadSecrets(); const username = s.byRole[role]; return { username, password: role === "owner" ? s.ownerPassword : s.users[username].password }; }

export async function privateSignOut(page) {
  const out = page.getByRole("button", { name: "Sign out" });
  if (await out.isVisible().catch(() => false)) { await out.click(); await page.getByLabel("Username").waitFor({ timeout: 10000 }); }
}
export async function privateSignIn(page, role) {
  await privateSignOut(page);
  const { username, password } = credentials(role);
  await page.getByLabel("Username").fill(username); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 25000 });
  await sleep(500);
}
export async function setLightTheme(page) {
  const btn = page.getByRole("button", { name: /^Theme:/ }); if (!(await btn.count())) return;
  if (/light/i.test((await btn.getAttribute("aria-label")) ?? "")) return;
  await btn.click(); await sleep(300);
  await page.getByRole("menuitemradio", { name: "Light" }).or(page.getByRole("menuitem", { name: "Light" })).or(page.getByText("Light", { exact: true })).first().click();
  await sleep(400);
}
