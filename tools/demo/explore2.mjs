import { createRequire } from "node:module"; import { join } from "node:path"; import { root } from "./lib/common.mjs";
const { chromium } = createRequire(join(root, "source", "package.json"))("playwright-core");
const b = await chromium.connectOverCDP("http://127.0.0.1:9241"); const page = b.contexts()[0].pages()[0];
await page.getByRole("row", { name: /Mara Demo/ }).click(); await page.waitForTimeout(1500);
console.log((await page.locator("main").ariaSnapshot()).split("\n").slice(28, 175).join("\n").slice(0, 7000));
await b.close();
