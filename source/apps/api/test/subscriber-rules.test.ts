import { describe, expect, it } from "vitest";

import { AppError } from "../src/app/app-error.js";
import { normalizeContact, normalizeSearch, serviceStatusEventType, validatePlanFields, validateServiceTransition } from "../src/modules/subscribers/subscriber-service.js";

describe("subscriber and plan rules", () => {
  it("normalizes search text and contact numbers consistently", () => {
    expect(normalizeSearch("  María   Santos ")).toBe("maría santos");
    expect(normalizeContact("+63 (917) 123-4567")).toBe("639171234567");
    expect(normalizeContact("  Staff@Example.COM ")).toBe("staff@example.com");
  });

  it("requires the attributes needed by each service type", () => {
    expect(() => validatePlanFields("INTERNET", 100, undefined)).not.toThrow();
    expect(() => validatePlanFields("CABLE", undefined, 80)).not.toThrow();
    expect(() => validatePlanFields("COMBO", 100, 80)).not.toThrow();
    expect(() => validatePlanFields("INTERNET", undefined, undefined)).toThrow(AppError);
    expect(() => validatePlanFields("COMBO", 100, undefined)).toThrowError(/channel count/i);
  });

  it("allows only explicit service lifecycle transitions", () => {
    expect(() => validateServiceTransition("ACTIVE", "SUSPENDED")).not.toThrow();
    expect(() => validateServiceTransition("SUSPENDED", "ACTIVE")).not.toThrow();
    expect(() => validateServiceTransition("TERMINATED", "ACTIVE")).toThrowError(/cannot move/i);
  });

  it("distinguishes first activation from reconnection", () => {
    expect(serviceStatusEventType("PENDING", "ACTIVE")).toBe("ACTIVATED");
    expect(serviceStatusEventType("SUSPENDED", "ACTIVE")).toBe("RECONNECTED");
  });
});
