import { describe, expect, it } from "vitest";

import { allocateOldestFirst, invoiceSettlementStatus, normalizeExternalReference } from "../src/modules/payments/payment-rules.js";

const invoices = [
  { invoiceId: "oldest", remainingCentavos: 10_000n },
  { invoiceId: "newest", remainingCentavos: 15_000n }
];

describe("payment allocation rules", () => {
  it("allocates partial payments to the oldest invoice", () => {
    expect(allocateOldestFirst(6_000n, invoices)).toEqual({ allocations: [{ invoiceId: "oldest", amountCentavos: 6_000n }], unallocatedCentavos: 0n });
  });

  it("allocates exact payments across invoices without losing value", () => {
    const result = allocateOldestFirst(25_000n, invoices);
    expect(result.allocations).toEqual([{ invoiceId: "oldest", amountCentavos: 10_000n }, { invoiceId: "newest", amountCentavos: 15_000n }]);
    expect(result.unallocatedCentavos).toBe(0n);
    expect(result.allocations.reduce((sum, item) => sum + item.amountCentavos, 0n)).toBe(25_000n);
  });

  it("surfaces overpayment instead of silently discarding it", () => {
    const result = allocateOldestFirst(30_000n, invoices);
    expect(result.unallocatedCentavos).toBe(5_000n);
    expect(result.allocations.reduce((sum, item) => sum + item.amountCentavos, 0n) + result.unallocatedCentavos).toBe(30_000n);
  });

  it("normalizes external references for future duplicate protection", () => {
    expect(normalizeExternalReference(" gcash-123 456 ")).toBe("GCASH123456");
    expect(normalizeExternalReference("GCASH123456")).toBe("GCASH123456");
    expect(() => normalizeExternalReference("gcash/123456")).toThrowError(/GCash reference/);
    expect(() => normalizeExternalReference("12345")).toThrowError(/GCash reference/);
    expect(() => normalizeExternalReference("A".repeat(41))).toThrowError(/GCash reference/);
  });

  it("distinguishes open, partial, and paid invoice settlement", () => {
    expect(invoiceSettlementStatus(0n, 99_900n)).toBe("OPEN");
    expect(invoiceSettlementStatus(50_000n, 99_900n)).toBe("PARTIALLY_PAID");
    expect(invoiceSettlementStatus(99_900n, 99_900n)).toBe("PAID");
    expect(() => invoiceSettlementStatus(100_000n, 99_900n)).toThrowError(/inconsistent/i);
  });
});
