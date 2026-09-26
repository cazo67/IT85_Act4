import { AppError } from "../../app/app-error.js";

export interface OpenInvoiceBalance {
  invoiceId: string;
  remainingCentavos: bigint;
}

export interface ProposedAllocation {
  invoiceId: string;
  amountCentavos: bigint;
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
  return value.trim().toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
}
