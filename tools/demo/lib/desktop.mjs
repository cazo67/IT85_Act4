// Visible-desktop driver: Playwright (over CDP) inspects geometry/conditions; every action is performed by the REAL OS pointer/keyboard
// through windows-desktop.ps1. Nothing here fills inputs programmatically or stubs native dialogs/network.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { root, runDir, sleep } from "./common.mjs";

const require = createRequire(join(root, "source", "package.json"));
const { chromium } = require("playwright-core");
const here = dirname(fileURLToPath(import.meta.url));

let seed = 20261012; // seeded variation, recorded in manifests
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

export class Native {
  constructor() {
    this.pending = new Map(); this.n = 0;
    this.proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(here, "..", "windows-desktop.ps1")], { stdio: ["pipe", "pipe", "inherit"] });
    this.ready = new Promise((res) => { createInterface({ input: this.proc.stdout }).on("line", (line) => { let m; try { m = JSON.parse(line); } catch { return; } if (m.ready) return res(); this.pending.get(m.id)?.(m); this.pending.delete(m.id); }); });
  }
  async send(cmd, args = {}) { await this.ready; const id = ++this.n; return new Promise((res, rej) => { this.pending.set(id, (m) => (m.ok ? res(m) : rej(new Error(m.error)))); this.proc.stdin.write(JSON.stringify({ id, cmd, ...args }) + "\n"); }); }
  close() { try { this.proc.stdin.end(); } catch {} this.proc.kill(); }
}

export class Recorder {
  constructor(name) { this.file = join(runDir, "logs", `${name}.actions.jsonl`); this.t0 = Date.now(); }
  log(event) { appendFileSync(this.file, JSON.stringify({ t: Date.now() - this.t0, ...event }) + "\n"); }
}

export class Client {
  constructor({ name, port, native, rec, role }) { Object.assign(this, { name, port, native, rec, role }); this.offset = { dx: 0, dy: 0 }; }
  async attach() {
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.port}`);
    this.page = this.browser.contexts()[0].pages()[0];
    await this.page.addInitScript(() => { window.__mm = null; addEventListener("mousemove", (e) => { window.__mm = { sx: e.screenX, sy: e.screenY, cx: e.clientX, cy: e.clientY }; }, true); });
    await this.page.evaluate(() => { window.__mm = null; addEventListener("mousemove", (e) => { window.__mm = { sx: e.screenX, sy: e.screenY, cx: e.clientX, cy: e.clientY }; }, true); });
    return this;
  }
  async calibrate() {
    const probes = [[900, 420], [1010, 470]];
    for (const [x, y] of probes) { await this.native.send("move", { x, y }); await sleep(180); }
    const mm = await this.page.evaluate(() => window.__mm);
    if (!mm) throw new Error(`${this.name}: pointer calibration saw no mousemove (window not focused/visible?)`);
    this.offset = { dx: mm.sx - mm.cx, dy: mm.sy - mm.cy };
    this.rec.log({ ev: "calibrated", client: this.name, offset: this.offset });
  }
  screenPoint(box, jitter = true, anchor = "center") {
    if (anchor === "left") return { x: Math.round(box.x + 16 + this.offset.dx), y: Math.round(box.y + box.height / 2 + this.offset.dy) };
    const mx = Math.min(12, box.width / 4), my = Math.min(8, box.height / 4);
    const x = box.x + box.width / 2 + (jitter ? (rnd() - 0.5) * Math.max(0, box.width / 2 - mx) : 0);
    const y = box.y + box.height / 2 + (jitter ? (rnd() - 0.5) * Math.max(0, box.height / 2 - my) : 0);
    return { x: Math.round(x + this.offset.dx), y: Math.round(y + this.offset.dy) };
  }
  async box(locator) { await locator.waitFor({ state: "visible", timeout: 20000 }); await locator.scrollIntoViewIfNeeded(); await sleep(120); const b = await locator.boundingBox(); if (!b) throw new Error("no bounding box"); return b; }
  async pointAt(locator, { overshoot = true, anchor = "center" } = {}) {
    const b = await this.box(locator); const p = this.screenPoint(b, true, anchor);
    await this.native.send("move", { ...p, overshoot: overshoot && b.width > 40 && b.height > 18 });
    return { b, p };
  }
  async click(locator, label, { think = [180, 450], overshoot = true, anchor = "center" } = {}) {
    await sleep(between(...think));
    const { p } = await this.pointAt(locator, { overshoot, anchor });
    await sleep(between(60, 200));
    await this.native.send("click", {});
    this.rec.log({ ev: "click", client: this.name, label, at: p });
    await sleep(between(80, 200));
  }
  // field-by-field entry with real keystrokes; secret values are never logged
  async type(locator, text, label, { lo = 140, hi = 320, secret = false, review = [600, 1200], anchor = "center", selectAll = false } = {}) {
    await this.click(locator, `focus ${label}`, { anchor });
    if (selectAll) { await this.native.send("keys", { seq: "^a" }); await sleep(200); }
    await sleep(between(250, 550));
    await this.native.send("type", { text, lo, hi });
    this.rec.log({ ev: "type", client: this.name, label, chars: text.length, ...(secret ? { secret: true } : { text }) });
    await sleep(between(...review));
  }
  // Tab to the next field (real key), then enter text field-by-field
  async tabType(text, label, { lo = 140, hi = 320, review = [500, 900], tabs = 1 } = {}) {
    for (let i = 0; i < tabs; i++) { await this.native.send("keys", { seq: "{TAB}" }); await sleep(between(200, 420)); }
    await this.native.send("type", { text, lo, hi });
    this.rec.log({ ev: "type", client: this.name, label, chars: text.length, text, via: "tab" });
    await sleep(between(...review));
  }
  async key(seq, label) { await this.native.send("keys", { seq }); this.rec.log({ ev: "keys", client: this.name, label }); await sleep(between(200, 450)); }
  async hold(ms, why) { const t = Math.min(ms, Math.max(1500, Math.round(ms * 0.72))); this.rec.log({ ev: "hold", client: this.name, ms: t, why }); await sleep(t); }
  async scroll(clicks, label) { for (let i = 0; i < clicks; i++) { await this.native.send("scroll", { delta: -120 * between(2, 3) }); await sleep(between(110, 220)); } this.rec.log({ ev: "scroll", label }); await sleep(between(450, 900)); }
  async ensureFullscreen(hwnd) {
    await this.native.send("foreground", { hwnd }); await sleep(500);
    for (let i = 0; i < 2; i++) { const h = await this.page.evaluate(() => window.innerHeight); if (h >= 1070) return true; await this.native.send("keys", { seq: "{F11}" }); await sleep(1500); }
    return (await this.page.evaluate(() => window.innerHeight)) >= 1070;
  }
  async focus(hwnd) { await this.native.send("foreground", { hwnd }); this.rec.log({ ev: "focus", client: this.name }); await sleep(450); }
}
