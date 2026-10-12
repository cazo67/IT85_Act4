// Sequential chapter runner. Usage: node run.mjs --chapters 01,02,03 [--tag rehearsal1]
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext } from "./lib/context.mjs";
import { startCapture } from "./lib/capture.mjs";
import { runDir, sleep } from "./lib/common.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const wanted = arg("chapters", "01,02,03").split(",");
const tag = arg("tag", "dev");
const modules = { "01": ["./chapters/b01-b03.mjs", "b01", "prep01"], "02": ["./chapters/b01-b03.mjs", "b02", "prep01"], "03": ["./chapters/b01-b03.mjs", "b03"],
  "04": ["./chapters/b04-b06.mjs", "b04", "prep04"], "05": ["./chapters/b04-b06.mjs", "b05", "prep05"], "06": ["./chapters/b04-b06.mjs", "b06", "prep06"],
  "07": ["./chapters/b07-b09.mjs", "b07", "prep07"], "08": ["./chapters/b07-b09.mjs", "b08", "prep08"], "09": ["./chapters/b07-b09.mjs", "b09", "prep09"],
  "10": ["./chapters/b10-b12.mjs", "b10", "prep10"], "11": ["./chapters/b10-b12.mjs", "b11", "prep11"], "12": ["./chapters/b10-b12.mjs", "b12", "prep12"] };
// Private session setup (unrecorded): make sure B=Cashier and C=Auditor are signed in; A is handled per chapter.
async function ensureFullscreen() {
  const { Native, Recorder, Client } = await import("./lib/desktop.mjs"); const { PORTS, hwnd } = await import("./lib/clients.mjs");
  const native = new Native(); const rec = new Recorder("setup");
  for (const n of ["A", "B", "C"]) { const c = await new Client({ name: n, port: PORTS[n], native, rec }).attach(); const ok = await c.ensureFullscreen(hwnd(n)); await c.browser.close(); if (!ok) throw new Error(`client ${n} is not full-screen`); }
  native.close();
}
async function ensureSessions() {
  const { privateSignIn } = await import("./lib/session.mjs"); const { pageOf } = await import("./lib/session.mjs"); const { PORTS } = await import("./lib/clients.mjs");
  for (const [n, role] of [["B", "cashier"], ["C", "auditor"]]) {
    const { browser, page } = await pageOf(PORTS[n]);
    await privateSignIn(page, role); // always fresh: after a checkpoint restore the old server sessions are revoked even if the UI still looks signed in
    await browser.close();
  }
}
// hide the primary taskbar for the owned run (it otherwise reveals other applications over native dialogs); restored on every exit path
import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url"; import { dirname as dn, join as jn } from "node:path";
const restoreTaskbar = () => spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", jn(dn(fileURLToPath(import.meta.url)), "Restore-Taskbar.ps1")], { stdio: "ignore" });
process.on("exit", restoreTaskbar); process.on("SIGINT", () => { restoreTaskbar(); process.exit(130); }); process.on("uncaughtException", (e) => { console.error(e); restoreTaskbar(); process.exit(1); });
{ const { Native } = await import("./lib/desktop.mjs"); const n = new Native(); await n.send("taskbar", { visible: false }); n.close(); }
await ensureFullscreen();
await ensureSessions();
const resultsFile = join(runDir, "manifests", `chapters-${tag}.json`);
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, "utf8")) : {};

for (const id of wanted) {
  const [file, fn, prep] = modules[id];
  const mod = await import(file);
  const ctx = await createContext(`${tag}-b${id}`);
  try {
    if (prep && mod[prep]) await mod[prep](ctx);
    const cap = startCapture(`${tag}-b${id}`); await sleep(700);
    const t0 = Date.now(); let status = "CAPTURED", error;
    try { await mod[fn](ctx); } catch (e) { status = "FAILED"; error = String(e.message ?? e); }
    const seconds = (Date.now() - t0) / 1000;
    const r = await cap.stop();
    results[id] = { status, error, seconds: Math.round(seconds * 10) / 10, leadInSec: Math.round((t0 - cap.t0) / 10) / 100, raw: r.file, captureMs: r.ms };
    console.log(`B${id} ${status} ${seconds.toFixed(1)} s${error ? " :: " + error : ""}`);
    writeFileSync(resultsFile, JSON.stringify(results, null, 1));
    if (status === "FAILED") break;
  } finally { await ctx.close(); }
}
process.exit(0);
