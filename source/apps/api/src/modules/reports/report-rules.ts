import { AppError } from "../../app/app-error.js";

export function validateReportRange(dateFrom: string, dateTo: string, maximumDays = 366): void {
  const from = dateOnly(dateFrom);
  const to = dateOnly(dateTo);
  const days = Math.floor((to - from) / 86_400_000) + 1;
  if (days < 1) throw new AppError(400, "INVALID_REPORT_RANGE", "The report start date must not be after its end date.");
  if (days > maximumDays) throw new AppError(400, "REPORT_RANGE_TOO_LARGE", `Select no more than ${maximumDays} days.`);
}

export function safeReportFilename(code: string, suffix: string, extension: "pdf" | "xlsx"): string {
  const safeSuffix = suffix.replace(/[^0-9A-Za-z_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `bcis-${code}-${safeSuffix || "report"}.${extension}`;
}

export function buildStatementBalances<T extends { debitCentavos: bigint; creditCentavos: bigint }>(openingCentavos: bigint, entries: T[]) {
  let balance = openingCentavos;
  const rows = entries.map((entry) => {
    balance += entry.debitCentavos - entry.creditCentavos;
    return { ...entry, balanceCentavos: balance };
  });
  return { rows, closingCentavos: balance };
}

export function sumCentavos(values: Array<bigint | string | number | null | undefined>): bigint {
  return values.reduce<bigint>((total, value) => total + BigInt(value ?? 0), 0n);
}

function dateOnly(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError(400, "INVALID_DATE", "Use a valid YYYY-MM-DD date.");
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const result = Date.UTC(year, month - 1, day); const check = new Date(result);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new AppError(400, "INVALID_DATE", "Use a valid calendar date.");
  return result;
}
