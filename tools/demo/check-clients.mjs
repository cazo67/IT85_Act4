import { Native, Recorder, Client } from "./lib/desktop.mjs"; import { hwnd, PORTS } from "./lib/clients.mjs"; import { runDir, sleep } from "./lib/common.mjs"; import { execFileSync } from "node:child_process"; import { join } from "node:path";
const native = new Native(); const rec = new Recorder("check");
for (const n of ["A", "B", "C"]) {
  const c = await new Client({ name: n, port: PORTS[n], native, rec }).attach();
  const ok = await c.ensureFullscreen(hwnd(n)); await c.calibrate(); await sleep(400);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "gdigrab", "-framerate", "30", "-offset_x", "0", "-offset_y", "0", "-video_size", "1920x1080", "-draw_mouse", "1", "-i", "desktop", "-frames:v", "1", "-vf", "scale=640:-1", join(runDir, "frames", `client-${n}.png`)]);
  console.log(n, "fullscreen", ok, JSON.stringify(c.offset));
}
native.close(); process.exit(0);
