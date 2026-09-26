import { describe, expect, it } from "vitest";

import { addCentavos, centavoStringSchema } from "./money.js";

describe("centavo contracts", () => {
  it("adds exact integer values without floating point arithmetic", () => {
    expect(addCentavos("99900", "50000", "-1200")).toBe("148700");
  });

  it("rejects decimal and exponent representations", () => {
    expect(centavoStringSchema.safeParse("999.00").success).toBe(false);
    expect(centavoStringSchema.safeParse("1e3").success).toBe(false);
  });
});

