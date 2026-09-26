import { AppError } from "../../app/app-error.js";

export type AgingBucket = "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
export type ServiceControlState = "REQUESTED" | "APPROVED" | "COMPLETED" | "REJECTED" | "CANCELLED";

export function daysPastDue(dueDate: string, asOfDate: string): number {
  const due = parseDateOnly(dueDate);
  const asOf = parseDateOnly(asOfDate);
  return Math.max(0, Math.floor((asOf - due) / 86_400_000));
}

export function agingBucket(dueDate: string, asOfDate: string): AgingBucket {
  const days = daysPastDue(dueDate, asOfDate);
  if (days === 0) return "CURRENT";
  if (days <= 30) return "DAYS_1_30";
  if (days <= 60) return "DAYS_31_60";
  if (days <= 90) return "DAYS_61_90";
  return "DAYS_91_PLUS";
}

export function validateServiceControlTransition(from: ServiceControlState, to: ServiceControlState): void {
  const allowed: Record<ServiceControlState, ServiceControlState[]> = {
    REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
    APPROVED: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: []
  };
  if (!allowed[from].includes(to)) throw new AppError(409, "INVALID_SERVICE_CONTROL_TRANSITION", `Service-control request cannot move from ${from} to ${to}.`);
}

export function requireIndependentActor(firstActorId: string, nextActorId: string, action: "approve" | "complete"): void {
  if (firstActorId === nextActorId) {
    throw new AppError(409, "SERVICE_CONTROL_SEPARATION_REQUIRED", action === "approve" ? "A different user must approve this request." : "A different user must complete the approved work.");
  }
}

function parseDateOnly(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError(400, "INVALID_DATE", "Use a valid YYYY-MM-DD date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new AppError(400, "INVALID_DATE", "Use a valid calendar date.");
  return timestamp;
}
