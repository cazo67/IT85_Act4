export const queryKeys = {
  dashboard: (asOf: string) => ["dashboard", asOf] as const,
  subscribers: {
    all: ["subscribers"] as const,
    list: (search: string, page: number) => ["subscribers", "list", { search, page }] as const,
    profile: (id: string) => ["subscribers", "profile", id] as const
  },
  plans: ["plans"] as const,
  billing: {
    preview: (periodKey: string) => ["billing", "preview", periodKey] as const,
    invoices: (periodKey: string, invoiceNumber: string, page: number) => ["billing", "invoices", { periodKey, invoiceNumber, page }] as const,
    invoice: (id: string) => ["billing", "invoice", id] as const
  },
  payments: ["payments"] as const,
  receivables: (asOf: string, overdueOnly: boolean) => ["receivables", { asOf, overdueOnly }] as const,
  collections: ["collections"] as const,
  collectorAssignments: (serviceAccountId: string) => ["collections", "assignments", serviceAccountId] as const,
  reports: ["reports"] as const,
  audit: ["audit"] as const,
  security: ["security"] as const,
  backups: ["backups"] as const
};

