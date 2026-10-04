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
  { code: "daily-collections", name: "Daily collection detail", parameters: ["dateFrom", "dateTo"] },
  { code: "weekly-collections", name: "Weekly collections by payment method", parameters: ["dateFrom", "dateTo"] },
  { code: "annual-collections", name: "Annual collections by month and payment method", parameters: ["dateFrom", "dateTo"] },
  { code: "monthly-collections", name: "Collections by day and payment method", parameters: ["dateFrom", "dateTo"] },
  { code: "billing-vs-collection", name: "Billing versus collection by month", parameters: ["dateFrom", "dateTo"] },
  { code: "billed-revenue", name: "Billed revenue by plan, service and current area", parameters: ["dateFrom", "dateTo"] },
  { code: "subscriber-master", name: "Subscriber master list", parameters: ["status", "search"] },
  { code: "ar-aging", name: "Accounts receivable aging", parameters: ["asOf"] },
  { code: "subscriber-soa", name: "Subscriber statement of account", parameters: ["subscriberId", "dateFrom", "dateTo"] },
  { code: "subscriber-ledger", name: "Subscriber ledger detail", parameters: ["subscriberId", "dateFrom", "dateTo"] },
  { code: "collector-assignments", name: "Collector assignments as of date", parameters: ["asOf"] },
  { code: "collector-performance", name: "Collector performance by batch date", parameters: ["dateFrom", "dateTo"] },
  { code: "payment-reversals", name: "Payment reversals and voided receipts", parameters: ["dateFrom", "dateTo"] },
  { code: "audit-activity", name: "User and audit activity", parameters: ["dateFrom", "dateTo"] },
  { code: "collector-reconciliation", name: "Collector reconciliation", parameters: ["dateFrom", "dateTo"] }
] as const;

export type ReportCode = typeof reportDefinitions[number]["code"];
