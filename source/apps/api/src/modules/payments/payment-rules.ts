import { AppError } from "../../app/app-error.js";

export interface OpenInvoiceBalance {
  invoiceId: string;
  remainingCentavos: bigint;
}

export interface ProposedAllocation {
  invoiceId: string;
  amountCentavos: bigint;
}

export type InvoiceSettlementStatus = "OPEN" | "PARTIALLY_PAID" | "PAID";

export function invoiceSettlementStatus(paidCentavos: bigint, totalCentavos: bigint): InvoiceSettlementStatus {
  if (totalCentavos <= 0n || paidCentavos < 0n || paidCentavos > totalCentavos) {
    throw new AppError(500, "INVALID_INVOICE_SETTLEMENT", "Invoice settlement values are inconsistent.");
  }
  if (paidCentavos === 0n) return "OPEN";
  return paidCentavos === totalCentavos ? "PAID" : "PARTIALLY_PAID";
}

export function allocateOldestFirst(amountCentavos: bigint, invoices: readonly OpenInvoiceBalance[]): { allocations: ProposedAllocation[]; unallocatedCentavos: bigint } {
  if (amountCentavos <= 0n) throw new AppError(400, "INVALID_PAYMENT_AMOUNT", "Payment amount must be greater than zero.");
  let remaining = amountCentavos;
  const allocations: ProposedAllocation[] = [];
  for (const invoice of invoices) {
    if (invoice.remainingCentavos <= 0n || remaining === 0n) continue;
    const applied = remaining < invoice.remainingCentavos ? remaining : invoice.remainingCentavos;
    allocations.push({ invoiceId: invoice.invoiceId, amountCentavos: applied });
    remaining -= applied;
  }
  return { allocations, unallocatedCentavos: remaining };
}

export function normalizeExternalReference(value: string): string {
  const normalized = normalizeReferenceText(value);
  if (!/^[A-Z0-9]{6,40}$/.test(normalized)) {
    throw new AppError(400, "INVALID_GCASH_REFERENCE", "GCash reference must contain 6–40 letters or digits; only spaces and hyphens may be removed.");
  }
  return normalized;
}

export function normalizePaymentReference(value: string): string {
  const normalized = normalizeReferenceText(value);
  if (!/^[A-Z0-9]{6,40}$/.test(normalized)) throw new AppError(400, "INVALID_PAYMENT_REFERENCE", "Payment reference must contain 6–40 letters or digits; only spaces and hyphens may be removed.");
  return normalized;
}

function normalizeReferenceText(value: string): string { return value.trim().toUpperCase().replace(/[ -]/g, ""); }
