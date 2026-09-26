import { describe, expect, it } from "vitest";

import { agingBucket, daysPastDue, requireIndependentActor, validateServiceControlTransition } from "../src/modules/receivables/receivable-rules.js";

describe("receivable rules", () => {
  it("treats invoices due on the as-of date as current", () => {
    expect(daysPastDue("2026-09-22", "2026-09-22")).toBe(0);
    expect(agingBucket("2026-09-22", "2026-09-22")).toBe("CURRENT");
  });

  it.each([
    ["2026-09-21", "DAYS_1_30"],
    ["2026-08-23", "DAYS_1_30"],
    ["2026-08-22", "DAYS_31_60"],
    ["2026-07-24", "DAYS_31_60"],
    ["2026-07-23", "DAYS_61_90"],
    ["2026-06-24", "DAYS_61_90"],
    ["2026-06-23", "DAYS_91_PLUS"]
  ])("places %s in %s at the exact aging boundary", (dueDate, bucket) => {
    expect(agingBucket(dueDate, "2026-09-22")).toBe(bucket);
  });

  it("uses date-only UTC arithmetic across daylight-saving dates", () => {
    expect(daysPastDue("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("rejects impossible calendar dates", () => {
    expect(() => daysPastDue("2026-02-30", "2026-03-01")).toThrow(/valid calendar date/i);
  });

  it("allows only the controlled request workflow", () => {
    expect(() => validateServiceControlTransition("REQUESTED", "APPROVED")).not.toThrow();
    expect(() => validateServiceControlTransition("APPROVED", "COMPLETED")).not.toThrow();
    expect(() => validateServiceControlTransition("REQUESTED", "COMPLETED")).toThrow(/cannot move/i);
  });

  it("requires different users for approval and completion", () => {
    expect(() => requireIndependentActor("user-a", "user-a", "approve")).toThrow(/different user/i);
    expect(() => requireIndependentActor("user-a", "user-b", "complete")).not.toThrow();
  });
});
