import { AppError } from "../../app/app-error.js";

export type BatchStatus = "DRAFT" | "ACTIVE" | "SUBMITTED" | "RECONCILED" | "CLOSED";

export function validateBatchTransition(from: BatchStatus, to: BatchStatus): void {
  const allowed: Record<BatchStatus, readonly BatchStatus[]> = {
    DRAFT: ["ACTIVE"],
    ACTIVE: ["SUBMITTED"],
    SUBMITTED: ["RECONCILED"],
    RECONCILED: ["CLOSED"],
    CLOSED: []
  };
  if (!allowed[from].includes(to)) throw new AppError(409, "INVALID_BATCH_TRANSITION", `Collection batch cannot move from ${from} to ${to}.`);
}

export function remittanceDifference(remittedCashCentavos: bigint, collectedCashCentavos: bigint): bigint {
  if (remittedCashCentavos < 0n || collectedCashCentavos < 0n) throw new AppError(400, "INVALID_REMITTANCE_AMOUNT", "Remittance values cannot be negative.");
  return remittedCashCentavos - collectedCashCentavos;
}
