import { AppError } from "../../app/app-error.js";

export interface BillingPeriod {
  key: string;
  start: string;
  end: string;
  invoiceDate: string;
}

export function parseBillingPeriod(periodKey: string): BillingPeriod {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new AppError(400, "INVALID_BILLING_PERIOD", "Use a billing period in YYYY-MM format.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key: periodKey, start: `${periodKey}-01`, end: `${periodKey}-${String(endDay).padStart(2, "0")}`, invoiceDate: `${periodKey}-${String(endDay).padStart(2, "0")}` };
}

// Provisional lab default: monthly service is due on the account's due day in the following month.
export function calculateDueDate(periodKey: string, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new AppError(400, "INVALID_DUE_DAY", "Due day must be from 1 through 28.");
  const period = parseBillingPeriod(periodKey);
  const [yearText, monthText] = period.start.split("-");
  const next = new Date(Date.UTC(Number(yearText), Number(monthText), dueDay));
  return next.toISOString().slice(0, 10);
}

export function invoiceLineTotal(unitAmountCentavos: bigint, quantity: number): bigint {
  if (unitAmountCentavos <= 0n || !Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "INVALID_INVOICE_ITEM", "Invoice item values must be positive.");
  return unitAmountCentavos * BigInt(quantity);
}
