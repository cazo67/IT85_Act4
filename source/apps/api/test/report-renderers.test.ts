import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { ReportDocument } from "../src/infrastructure/reports/report-model.js";
import { renderReportPdf, renderReportXlsx, safeText } from "../src/infrastructure/reports/report-renderers.js";
import { buildStatementBalances, safeReportFilename, sumCentavos, validateReportRange } from "../src/modules/reports/report-rules.js";

const { Workbook } = ExcelJS;

const sample: ReportDocument = {
  code: "monthly-collections",
  title: "Collections Report",
  parameters: { dateFrom: "2026-09-01", dateTo: "2026-09-22" },
  generatedAt: "2026-09-22T10:00:00.000Z",
  generatedBy: "Test User",
  columns: [
    { key: "date", label: "Date", type: "date" },
    { key: "description", label: "Description", type: "text" },
    { key: "amountCentavos", label: "Amount", type: "money" }
  ],
  rows: [{ date: "2026-09-22", description: "=HYPERLINK(\"unsafe\")", amountCentavos: "12345" }],
  summary: [{ label: "Total", value: "12345", type: "money" }]
};

describe("report exports", () => {
  it("creates a nonempty PDF document", async () => {
    const output = await renderReportPdf(sample);
    expect(output.subarray(0, 5).toString()).toBe("%PDF-");
    expect(output.length).toBeGreaterThan(1_000);
  });

  it("creates an XLSX with typed dates and money and escaped user text", async () => {
    const output = await renderReportXlsx(sample);
    expect(output.subarray(0, 2).toString()).toBe("PK");
    const workbook = new Workbook();
    await workbook.xlsx.load(output as never);
    const sheet = workbook.getWorksheet("Report");
    expect(sheet?.getCell("A2").value).toBeInstanceOf(Date);
    expect(sheet?.getCell("B2").value).toBe("'=HYPERLINK(\"unsafe\")");
    expect(sheet?.getCell("C2").value).toBe(123.45);
    expect(sheet?.views[0]?.state).toBe("frozen");
    expect(workbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("monthly-collections");
  });

  it("protects every spreadsheet formula prefix", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@cmd"]) expect(safeText(value)).toBe(`'${value}`);
    expect(safeText("ordinary text")).toBe("ordinary text");
  });

  it("bounds report ranges and sanitizes filenames", () => {
    expect(() => validateReportRange("2026-01-01", "2026-12-31")).not.toThrow();
    expect(() => validateReportRange("2026-12-31", "2026-01-01")).toThrow(/start date/i);
    expect(() => validateReportRange("2025-01-01", "2026-12-31")).toThrow(/no more than/i);
    expect(safeReportFilename("ar-aging", "../../2026/09/22", "pdf")).toBe("bcis-ar-aging-2026-09-22.pdf");
  });

  it("reconciles statement opening, activity, and closing balances", () => {
    const result = buildStatementBalances(25_000n, [{ debitCentavos: 99_900n, creditCentavos: 0n }, { debitCentavos: 0n, creditCentavos: 50_000n }]);
    expect(result.rows.map((row) => row.balanceCentavos)).toEqual([124_900n, 74_900n]);
    expect(result.closingCentavos).toBe(25_000n + sumCentavos([99_900n, -50_000n]));
  });
});
