import { describe, expect, it } from "vitest";

import { PendingCommand } from "./pending-command.js";

describe("PendingCommand", () => {
  it("reuses one key after a lost response and rotates only after success", () => {
    const command = new PendingCommand();
    const first = command.keyFor("subscriber-1:5000");
    expect(command.keyFor("subscriber-1:5000")).toBe(first);
    command.clear();
    expect(command.keyFor("subscriber-1:5000")).not.toBe(first);
  });

  it("rejects changing the payload while its result is uncertain", () => {
    const command = new PendingCommand();
    command.keyFor("subscriber-1:5000");
    expect(() => command.keyFor("subscriber-1:6000")).toThrow(/Check payment history/);
  });
});
