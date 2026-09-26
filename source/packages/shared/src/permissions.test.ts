import { describe, expect, it } from "vitest";

import { permissionCodeSchema, permissionCodes, roleCodeSchema } from "./permissions.js";

describe("RBAC contracts", () => {
  it("keeps permission identifiers unique", () => {
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
  });

  it("rejects unknown roles and permissions", () => {
    expect(permissionCodeSchema.safeParse("database.drop").success).toBe(false);
    expect(roleCodeSchema.safeParse("SUPER_USER").success).toBe(false);
  });
});

