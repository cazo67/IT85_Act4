import ExcelJS from "exceljs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { reportDefinitions } from "../src/infrastructure/reports/report-model.js";
import { renderReportPdf, renderReportXlsx } from "../src/infrastructure/reports/report-renderers.js";
import { ReportService, type ReportParameters } from "../src/modules/reports/report-service.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";

describe.skipIf(!testUri)("Gate 6 report catalog on guarded PostgreSQL", () => {
  let database: DatabaseHandle;
  let pool: Pool;
  let service: ReportService;
  let day: string;
  let subscriberId: string;

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") {
      throw new Error("Gate 6 report export tests require guarded 127.0.0.1:5433/bcis_test.");
    }
    pool = new Pool({ connectionString: testUri, max: 2 });
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations, current_date::text as day");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The guarded test database is not at migration 19.");
    day = identity.rows[0]?.day as string;
    subscriberId = (await pool.query("select id from subscribers order by id limit 1")).rows[0]?.id as string;
    if (!subscriberId) throw new Error("The synthetic subscriber seed is missing.");
    database = createDatabase(testUri);
    service = new ReportService(database.db);
  });

  afterAll(async () => {
    await database?.close();
    await pool?.end();
  });

  it("previews and renders PDF/XLSX for every catalog family", async () => {
    expect(service.definitions().map((item) => item.code)).toEqual(reportDefinitions.map((item) => item.code));
    for (const definition of reportDefinitions) {
      const parameters = parametersFor(definition.code, day, subscriberId);
      const report = await service.run(definition.code, parameters, "Gate 6 report check");
      expect(report.code).toBe(definition.code);
      expect(report.columns.length).toBeGreaterThan(0);
      expect(report.summary.length).toBeGreaterThan(0);

      const pdf = await renderReportPdf(report);
      expect(pdf.subarray(0, 5).toString(), definition.code).toBe("%PDF-");
      expect(pdf.length, definition.code).toBeGreaterThan(1_000);

      const xlsx = await renderReportXlsx(report);
      expect(xlsx.subarray(0, 2).toString(), definition.code).toBe("PK");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsx as never);
      const sheet = workbook.getWorksheet("Report");
      expect(sheet?.rowCount, definition.code).toBe(report.rows.length + 1);
      expect(sheet?.columnCount, definition.code).toBe(report.columns.length);
      for (const [rowIndex, row] of report.rows.entries()) {
        for (const [columnIndex, column] of report.columns.entries()) {
          expectExportedCell(
            sheet?.getRow(rowIndex + 2).getCell(columnIndex + 1).value,
            row[column.key] ?? "",
            column.type,
            `${definition.code} row ${rowIndex + 1} ${column.key}`
          );
        }
      }
      const metadata = workbook.getWorksheet("Parameters");
      expect(metadata?.getCell("B2").value, definition.code).toBe(definition.code);
      expect(metadata?.getCell("B4").value, definition.code).toBe(report.generatedBy);
      const firstSummaryRow = 7 + Object.keys(report.parameters).length;
      for (const [index, item] of report.summary.entries()) {
        expect(metadata?.getRow(firstSummaryRow + index).getCell(1).value, `${definition.code} summary ${item.label}`).toBe(item.label);
        expectExportedCell(metadata?.getRow(firstSummaryRow + index).getCell(2).value, item.value, item.type, `${definition.code} summary ${item.label}`);
      }
    }
  }, 120_000);
});

function parametersFor(code: string, day: string, subscriberId: string): ReportParameters {
  if (code === "annual-collections") return { dateFrom: `${day.slice(0, 4)}-01-01`, dateTo: `${day.slice(0, 4)}-12-31` };
  if (code === "subscriber-master") return { status: "ALL" };
  if (code === "ar-aging" || code === "collector-assignments") return { asOf: day };
  if (code === "subscriber-soa" || code === "subscriber-ledger") return { subscriberId, dateFrom: day, dateTo: day };
  return { dateFrom: day, dateTo: day };
}

function expectExportedCell(actual: unknown, source: string | number, type: string, context: string): void {
  if (type === "money") {
    expect(typeof actual, context).toBe("number");
    expect(Math.round((actual as number) * 100), context).toBe(Number(BigInt(source)));
  } else if (type === "integer") {
    expect(actual, context).toBe(Number(source));
  } else if (type === "date") {
    if (source === "") {
      expect(actual, context).toBe("");
      return;
    }
    expect(actual, context).toBeInstanceOf(Date);
    expect(Number.isNaN((actual as Date).getTime()), `${context} source=${String(source)}`).toBe(false);
    expect((actual as Date).toISOString().slice(0, 10), context).toBe(String(source));
  } else {
    const value = String(source);
    expect(actual, context).toBe(/^[=+\-@]/.test(value) ? `'${value}` : value);
  }
}
