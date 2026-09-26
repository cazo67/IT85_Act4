import { describe, expect, it } from "vitest";

import { calculateDueDate, invoiceLineTotal, parseBillingPeriod } from "../src/modules/billing/billing-rules.js";

describe("billing rules", () => {
  it("derives month boundaries without local-time drift", () => {
    expect(parseBillingPeriod("2026-02")).toEqual({ key: "2026-02", start: "2026-02-01", end: "2026-02-28", invoiceDate: "2026-02-28" });
    expect(parseBillingPeriod("2028-02").end).toBe("2028-02-29");
    expect(() => parseBillingPeriod("2026-13")).toThrowError(/YYYY-MM/i);
  });

  it("uses the provisional next-month due-day policy", () => {
    expect(calculateDueDate("2026-09", 10)).toBe("2026-10-10");
    expect(calculateDueDate("2026-12", 28)).toBe("2027-01-28");
  });

  it("calculates invoice lines using bigint centavos only", () => {
    expect(invoiceLineTotal(129_900n, 1)).toBe(129_900n);
    expect(invoiceLineTotal(50n, 3)).toBe(150n);
    expect(() => invoiceLineTotal(-1n, 1)).toThrowError(/positive/i);
    expect(() => invoiceLineTotal(0n, 1)).toThrowError(/positive/i);
  });
});
