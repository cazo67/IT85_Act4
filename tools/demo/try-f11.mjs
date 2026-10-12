import { readFileSync } from "node:fs"; import { join } from "node:path";
import { Native } from "./lib/desktop.mjs"; import { hwndFor } from "./lib/capture.mjs"; import { runDir, sleep } from "./lib/common.mjs";
const n = new Native(); const hwnd = hwndFor(Number(readFileSync(join(runDir, "runtime", "clientA.pid"), "utf8")));
await n.send("foreground", { hwnd }); await sleep(600); await n.send("keys", { seq: "{F11}" }); await sleep(1800); n.close(); process.exit(0);
