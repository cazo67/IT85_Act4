import { describe, expect, it } from "vitest";

import { getContentSecurityPolicy, getMainWindowOptions } from "./window-options.js";

describe("main window security", () => {
  it("isolates the renderer from Node.js", () => {
    const options = getMainWindowOptions("C:/safe/preload.js");

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: "C:/safe/preload.js"
    });
    expect(options.minWidth).toBe(640);
    expect(options.minHeight).toBe(600);
  });

  it("limits renderer connections to the configured API origin", () => {
    const policy = getContentSecurityPolicy("https://bcis.internal:4100");
    expect(policy).toContain("connect-src 'self' https://bcis.internal:4100");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(() => getContentSecurityPolicy("https://user:secret@bcis.internal/path")).toThrow(/origin/i);
  });

  it("allows the Vite refresh bootstrap only during local development", () => {
    const policy = getContentSecurityPolicy("http://127.0.0.1:4100", true);
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("ws://localhost:*");
  });
});
