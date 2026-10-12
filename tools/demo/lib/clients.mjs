// Launches/ensures the run-owned Electron clients (separate profiles + CDP ports) and the kiosk Edge card window. Owned PIDs only.
import { spawn, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { root, runDir, sleep, loadSecrets } from "./common.mjs";
import { hwndFor } from "./capture.mjs";

export const PORTS = { A: 9241, B: 9242, C: 9243, EDGE: 9250 };
const electronExe = () => { const d = join(root, "source", "node_modules", ".pnpm"); const e = readdirSync(d).find((x) => x.startsWith("electron@")); return join(d, e, "node_modules", "electron", "dist", "electron.exe"); };
const alive = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
const pidFile = (n) => join(runDir, "runtime", `client${n}.pid`);

export async function ensureClient(name) {
  if (await alive(PORTS[name])) return Number(readFileSync(pidFile(name), "utf8"));
  const profile = join(runDir, "runtime", "profiles", name); mkdirSync(profile, { recursive: true });
  const env = { ...process.env, BCIS_API_ORIGIN: "http://127.0.0.1:4112" }; delete env.ELECTRON_RUN_AS_NODE;
  const out = openSync(join(runDir, "logs", `client${name}.log`), "a");
  const p = spawn(electronExe(), [join(runDir, "work", "desktop"), `--remote-debugging-port=${PORTS[name]}`, `--user-data-dir=${profile}`], { env, detached: true, stdio: ["ignore", out, out] });
  p.unref(); writeFileSync(pidFile(name), String(p.pid));
  for (let i = 0; i < 40 && !(await alive(PORTS[name])); i++) await sleep(500);
  if (!(await alive(PORTS[name]))) throw new Error(`client ${name} did not start`);
  await sleep(1500);
  return p.pid;
}

export async function ensureEdge() {
  if (await alive(PORTS.EDGE)) return Number(readFileSync(pidFile("EDGE"), "utf8"));
  const edge = JSON.parse(readFileSync(join(runDir, "manifests", "assets.json"), "utf8")).edge;
  const start = "file:///" + join(runDir, "assets", "card-intro.html").replace(/\\/g, "/");
  const profile = join(runDir, "runtime", "profiles", "edge"); mkdirSync(profile, { recursive: true });
  const p = spawn(edge, ["--kiosk", "--edge-kiosk-type=fullscreen", "--no-first-run", "--no-default-browser-check", "--window-position=0,0", `--remote-debugging-port=${PORTS.EDGE}`, `--user-data-dir=${profile}`, start], { detached: true, stdio: "ignore" });
  p.unref(); writeFileSync(pidFile("EDGE"), String(p.pid));
  for (let i = 0; i < 40 && !(await alive(PORTS.EDGE)); i++) await sleep(500);
  await sleep(1500);
  return p.pid;
}

export const hwnd = (name) => hwndFor(Number(readFileSync(pidFile(name), "utf8")));
