export type ReportCell = string | number;
export type ReportColumnType = "text" | "date" | "integer" | "money";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  width?: number;
}

export interface ReportDocument {
  code: string;
  title: string;
  parameters: Record<string, string>;
  generatedAt: string;
  generatedBy: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  summary: Array<{ label: string; value: ReportCell; type: ReportColumnType }>;
}

export const reportDefinitions = [
  { code: "monthly-collections", name: "Collections by day and payment method", parameters: ["dateFrom", "dateTo"] },
  { code: "ar-aging", name: "Accounts receivable aging", parameters: ["asOf"] },
  { code: "subscriber-soa", name: "Subscriber statement of account", parameters: ["subscriberId", "dateFrom", "dateTo"] },
  { code: "collector-reconciliation", name: "Collector reconciliation", parameters: ["dateFrom", "dateTo"] }
] as const;

export type ReportCode = typeof reportDefinitions[number]["code"];
