import { spawn, execFileSync } from "node:child_process"; import { join } from "node:path";
import { Native } from "./lib/desktop.mjs"; import { root, runDir, sleep } from "./lib/common.mjs";
const owned = "Get-CimInstance Win32_Process -Filter \"Name='WindowsTerminal.exe'\" | Where-Object { $_.CommandLine -like '*bcisdemo*' }";
const ps = (c) => execFileSync("powershell.exe", ["-NoProfile", "-Command", c], { encoding: "utf8" }).trim();
ps(`${owned} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`); await sleep(600);
spawn("wt.exe", ["-w", "bcisdemo", "new-tab", "--title", "BCIS demo terminal", "--suppressApplicationTitle", "powershell.exe", "-NoLogo", "-NoProfile", "-NoExit", "-File", join(root, "tools", "demo", "terminal-start.ps1")], { detached: true, stdio: "ignore" }).unref();
await sleep(3500);
const hw = Number(ps(`${owned} | Select-Object -First 1 | ForEach-Object { $p = Get-Process -Id $_.ProcessId; $p.Refresh(); $p.MainWindowHandle.ToInt64() }`));
console.log("hwnd", hw);
const n = new Native();
await n.send("foreground", { hwnd: hw }); await sleep(600);
await n.send("keys", { seq: "{F11}" }); await sleep(1500);
for (let i = 0; i < 5; i++) { await n.send("keys", { seq: "^{ADD}" }); await sleep(150); }
await sleep(500); await n.send("type", { text: "node tools/demo/denied.mjs", lo: 90, hi: 160 }); await sleep(300); await n.send("keys", { seq: "{ENTER}" }); await sleep(2500);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "gdigrab", "-framerate", "30", "-offset_x", "0", "-offset_y", "0", "-video_size", "1920x1080", "-draw_mouse", "1", "-i", "desktop", "-frames:v", "1", "-vf", "scale=1280:-1", join(runDir, "frames", "terminal-test.png")]);
n.close(); process.exit(0);
