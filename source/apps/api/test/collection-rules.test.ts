import { describe, expect, it } from "vitest";

import { remittanceDifference, validateBatchTransition } from "../src/modules/collections/collection-rules.js";

describe("collection batch rules", () => {
  it("enforces the forward-only lifecycle", () => {
    expect(() => validateBatchTransition("DRAFT", "ACTIVE")).not.toThrow();
    expect(() => validateBatchTransition("ACTIVE", "SUBMITTED")).not.toThrow();
    expect(() => validateBatchTransition("SUBMITTED", "REMITTED")).not.toThrow();
    expect(() => validateBatchTransition("SUBMITTED", "RECONCILED")).not.toThrow(); // Legacy remittance.
    expect(() => validateBatchTransition("REMITTED", "RECONCILED")).not.toThrow();
    expect(() => validateBatchTransition("SUBMITTED", "CLOSED")).toThrowError(/cannot move/i);
    expect(() => validateBatchTransition("RECONCILED", "CLOSED")).not.toThrow();
    expect(() => validateBatchTransition("CLOSED", "ACTIVE")).toThrowError(/cannot move/i);
    expect(() => validateBatchTransition("ACTIVE", "CLOSED")).toThrowError(/cannot move/i);
  });

  it("keeps shortage and overage signs visible", () => {
    expect(remittanceDifference(9_000n, 10_000n)).toBe(-1_000n);
    expect(remittanceDifference(11_000n, 10_000n)).toBe(1_000n);
    expect(remittanceDifference(10_000n, 10_000n)).toBe(0n);
  });
});
