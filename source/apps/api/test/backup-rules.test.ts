import { describe, expect, it } from "vitest";

import { expectedRestoreConfirmation, financialSnapshotsMatch, postgresEnvironment, requirePathInside, requireRestoreConfirmation } from "../src/modules/backups/backup-rules.js";

describe("backup safety rules", () => {
  it("requires an exact backup-specific restore phrase", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(expectedRestoreConfirmation(id)).toBe(`RESTORE ${id}`);
    expect(() => requireRestoreConfirmation(id, `RESTORE ${id}`)).not.toThrow();
    expect(() => requireRestoreConfirmation(id, "RESTORE backup")).toThrow(/exactly/i);
  });

  it("rejects backup paths outside the configured root", () => {
    expect(requirePathInside("C:\\BCIS\\backups", "C:\\BCIS\\backups\\safe-id\\database.dump")).toMatch(/database\.dump$/);
    expect(() => requirePathInside("C:\\BCIS\\backups", "C:\\BCIS\\database.dump")).toThrow(/outside/i);
    expect(() => requirePathInside("C:\\BCIS\\backups", "C:\\BCIS\\backups")).toThrow(/outside/i);
  });

  it("passes PostgreSQL credentials by environment instead of command arguments", () => {
    const environment = postgresEnvironment("postgresql://bcis_app:s%40fe@db.local:5433/bcis?sslmode=require");
    expect(environment.PGHOST).toBe("db.local");
    expect(environment.PGPORT).toBe("5433");
    expect(environment.PGUSER).toBe("bcis_app");
    expect(environment.PGPASSWORD).toBe("s@fe");
    expect(environment.PGDATABASE).toBe("bcis");
    expect(environment.PGSSLMODE).toBe("require");
    expect(environment.DATABASE_URL).toBeUndefined();
  });

  it("compares financial snapshots without depending on JSON object key order", () => {
    const manifest = { invoiceCount: 61, invoiceTotalCentavos: "7963900", paymentCount: 2 };
    const stored = { paymentCount: 2, invoiceTotalCentavos: "7963900", invoiceCount: 61 };

    expect(financialSnapshotsMatch(manifest, stored)).toBe(true);
    expect(financialSnapshotsMatch(manifest, { ...stored, paymentCount: 3 })).toBe(false);
  });
});
