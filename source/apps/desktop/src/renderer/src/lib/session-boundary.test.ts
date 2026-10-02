import { describe, expect, it } from "vitest";

import { lockSessionBoundary } from "./session-boundary.js";

describe("session lock boundary", () => {
  it("hides private content before the server request finishes", async () => {
    const events: string[] = [];
    let finishRemote: (() => void) | undefined;
    const pending = lockSessionBoundary(
      () => events.push("local-lock"),
      () => new Promise<void>((resolve) => { events.push("remote-start"); finishRemote = resolve; })
    );
    expect(events).toEqual(["local-lock", "remote-start"]);
    finishRemote?.();
    await pending;
  });

  it("keeps the local lock when the API is unavailable", async () => {
    let locallyLocked = false;
    await expect(lockSessionBoundary(
      () => { locallyLocked = true; },
      async () => { throw new Error("API unavailable"); }
    )).resolves.toBeUndefined();
    expect(locallyLocked).toBe(true);
  });
});
