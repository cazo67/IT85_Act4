// gdigrab capture of the primary 1920x1080 display, CFR-filled, silent, to MKV. Stop gracefully with 'q'.
import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import { runDir } from "./common.mjs";

export function startCapture(name) {
  const file = join(runDir, "raw", `${name}.mkv`);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "gdigrab", "-framerate", "30", "-offset_x", "0", "-offset_y", "0", "-video_size", "1920x1080", "-draw_mouse", "1", "-i", "desktop",
    "-an", "-vf", "fps=30", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", file];
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = ""; proc.stderr.on("data", (d) => (err += d));
  const t0 = Date.now();
  return {
    file, t0,
    async stop() { proc.stdin.write("q"); await new Promise((r) => proc.on("exit", r)); return { file, ms: Date.now() - t0, err }; }
  };
}

export function hwndFor(pid) {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", `$p=Get-Process -Id ${pid}; $p.Refresh(); $p.MainWindowHandle.ToInt64()`], { encoding: "utf8" });
  return Number(out.trim());
}
