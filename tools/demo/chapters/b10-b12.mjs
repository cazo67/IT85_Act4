// B10 management report PDF/XLSX export, B11 role restriction / local clients / API recovery, B12 backup and closing.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sleep, runDir, root } from "../lib/common.mjs";
import { sql, expect } from "../lib/sql.mjs";
import { privateSignIn } from "../lib/session.mjs";

const resetTo = async (client, view) => { await client.page.getByRole("button", { name: view, exact: true }).click(); await sleep(500); };
const reportsDir = join(runDir, "reports");

export async function prep10(ctx) { await resetTo(ctx.clients.C, "Dashboard"); }
async function saveVia(ctx, C, buttonName, filename, savedPattern) {
  await C.click(C.page.getByRole("button", { name: buttonName }), `click ${buttonName}`);
  const d = await ctx.native.send("waitdialog", { title: "Save As", timeoutMs: 15000 }); if (!d.found) throw new Error("native Save As dialog did not appear");
  await sleep(500);
  await ctx.native.send("keys", { seq: "^a" }); await sleep(150);
  await ctx.native.send("type", { text: join(reportsDir, filename), lo: 12, hi: 30 }); await sleep(400);
  await ctx.native.send("keys", { seq: "{ENTER}" });
  const closed = await ctx.native.send("dialogclosed", { title: "Save As", timeoutMs: 15000 }); if (!closed.closed) throw new Error("Save As dialog did not close");
  await C.page.getByText(savedPattern).first().waitFor({ timeout: 20000 });
  for (let i = 0; i < 50 && !existsSync(join(reportsDir, filename)); i++) await sleep(100);
  ctx.rec.log({ ev: "native_save", file: filename, exists: existsSync(join(reportsDir, filename)) });
  await C.hold(1200, `${filename} saved`);
}
export async function b10(ctx) {
  const C = ctx.clients.C, p = C.page;
  await ctx.show("C", "Auditor client");
  await ctx.nav(C, "Reports");
  await C.click(p.getByRole("button", { name: "Preview", exact: true }), "preview collections report");
  await p.getByText(/Collections by day/).first().waitFor({ timeout: 15000 });
  await C.scroll(2, "report totals"); await C.hold(2400, "report totals: Cash and verified GCash, reversal excluded");
  await saveVia(ctx, C, "Save PDF", "collections-oct-1-12.pdf", /\.pdf was saved\./);
  await saveVia(ctx, C, "Save XLSX", "collections-oct-1-12.xlsx", /\.xlsx was saved\./);
  await ctx.edgePage.goto("file:///" + join(reportsDir, "collections-oct-1-12.pdf").replace(/\\/g, "/")); await ctx.show("EDGE", "exported PDF in the browser"); await sleep(3600);
  expect("pdf exists", existsSync(join(reportsDir, "collections-oct-1-12.pdf")), true); expect("xlsx exists", existsSync(join(reportsDir, "collections-oct-1-12.xlsx")), true);
}

export async function prep11(ctx) {
  await resetTo(ctx.clients.B, "Dashboard"); await resetTo(ctx.clients.C, "Dashboard"); await privateSignIn(ctx.clients.A.page, "admin"); await resetTo(ctx.clients.A, "Dashboard");
  await ctx.preload("card-security");
  // terminal is launched, made full-screen and zoomed before capture starts (setup, not footage)
  closeTerminal(); await sleep(800); openTerminal(); await sleep(3500);
  const hw = terminalHwnd(); if (!hw) throw new Error("terminal window not found");
  ctx.hw.TERM = hw; await ctx.native.send("foreground", { hwnd: hw, minimize: ctx.hw.EDGE }); await sleep(500); await ctx.native.send("keys", { seq: "{F11}" }); await sleep(1300);
  for (let i = 0; i < 5; i++) { await ctx.native.send("keys", { seq: "^{ADD}" }); await sleep(150); }
  await sleep(400);
}
function openTerminal() {
  spawn("wt.exe", ["-w", "bcisdemo", "new-tab", "--title", "BCIS demo terminal", "--suppressApplicationTitle", "powershell.exe", "-NoLogo", "-NoProfile", "-NoExit", "-File", join(root, "tools", "demo", "terminal-start.ps1")], { detached: true, stdio: "ignore" }).unref();
}
const ownedTerminal = "Get-CimInstance Win32_Process -Filter \"Name='WindowsTerminal.exe'\" | Where-Object { $_.CommandLine -like '*bcisdemo*' }";
function terminalHwnd() {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", `${ownedTerminal} | Select-Object -First 1 | ForEach-Object { $p = Get-Process -Id $_.ProcessId; $p.Refresh(); $p.MainWindowHandle.ToInt64() }`], { encoding: "utf8" }).trim();
  return Number(out) || 0;
}
export function closeTerminal() { try { execFileSync("powershell.exe", ["-NoProfile", "-Command", `${ownedTerminal} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]); } catch {} }

export async function b11(ctx) {
  const A = ctx.clients.A, B = ctx.clients.B, C = ctx.clients.C;
  await ctx.card("card-security", 3400, "security lead");
  await ctx.show("B", "Cashier client");
  await B.hold(2200, "Cashier navigation: no User accounts or Backup entries");
  await ctx.native.send("foreground", { hwnd: ctx.hw.TERM, minimize: ctx.hw.EDGE }); ctx.rec.log({ ev: "switch", to: "TERM", why: "real terminal" }); await sleep(700);
  await ctx.native.send("type", { text: "node tools/demo/denied.mjs", lo: 90, hi: 160 }); await sleep(500); await ctx.native.send("keys", { seq: "{ENTER}" });
  await sleep(1600); ctx.rec.log({ ev: "hold", why: "real 403 from the API" }); await sleep(2400);
  closeTerminal();
  // Administrator edits a secondary contact; Auditor independently reloads the profile
  await ctx.card("role-admin-contact", 1500, "role card");
  await ctx.show("A", "Administrator client");
  await ctx.nav(A, "Subscribers");
  await A.click(A.page.getByRole("row", { name: /Mara Demo/ }), "open Mara Demo");
  await A.page.getByRole("heading", { name: "Mara Demo" }).waitFor({ timeout: 15000 });
  await A.scroll(2, "manage contacts");
  await A.click(A.page.getByRole("button", { name: "Edit contact Demo desk A" }), "edit secondary contact");
  // planned harmless missed click on explanatory text (no control), then the intended field
  await A.click(A.page.getByText(/Saving creates a new/).first(), "planned_harmless_missed_click", { think: [250, 400] });
  ctx.rec.log({ ev: "planned_harmless_missed_click" });
  await sleep(450);
  await A.type(A.page.getByLabel("Contact value"), "Demo desk B", "contact value", { selectAll: true, review: [500, 800] });
  await A.click(A.page.getByRole("button", { name: "Save contact changes" }), "save contact changes");
  await A.page.getByText("Demo desk B").first().waitFor({ timeout: 15000 });
  await A.hold(1600, "Administrator sees replacement contact");
  expect("active contact", sql("select value from subscriber_contacts where type='OTHER' and is_active and subscriber_id=(select id from subscribers where first_name='Mara')"), "Demo desk B");
  expect("prior contact retained inactive", sql("select count(*) from subscriber_contacts where value='Demo desk A' and not is_active"), 1);
  await ctx.card("role-auditor-reload", 1500, "role card");
  await ctx.show("C", "Auditor client reloads profile");
  await ctx.nav(C, "Subscribers");
  await C.click(C.page.getByRole("row", { name: /Mara Demo/ }), "open Mara Demo");
  await C.page.getByRole("heading", { name: "Mara Demo" }).waitFor({ timeout: 15000 });
  await C.hold(2800, "Auditor sees saved contact Demo desk B");
}

export async function prep12(ctx) { await privateSignIn(ctx.clients.A.page, "owner"); }
export async function b12(ctx) {
  const A = ctx.clients.A, p = A.page;
  await ctx.card("role-owner", 1500, "role card");
  await ctx.show("A", "Owner client");
  await ctx.nav(A, "Backup and recovery");
  await A.click(p.getByRole("button", { name: "Create backup" }), "create backup");
  await p.getByRole("button", { name: /^Verify/ }).first().waitFor({ timeout: 90000 });
  await A.hold(1200, "backup created");
  await A.click(p.getByRole("button", { name: /^Verify/ }).first(), "verify backup");
  await p.getByText("VERIFIED", { exact: true }).first().waitFor({ timeout: 60000 });
  await A.hold(3000, "VERIFIED, size, checksum, catalog");
  expect("backup history verified", sql("select count(*) from backup_runs where status='VERIFIED'"), 1);
  await ctx.card("card-closing", 5500, "closing card");
}
