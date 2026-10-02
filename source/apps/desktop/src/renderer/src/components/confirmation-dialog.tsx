import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function ConfirmationDialog({ open, title, description, details, confirmLabel, busy = false, destructive = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; details?: ReactNode; confirmLabel: string; busy?: boolean; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onCancel(); }}><section aria-describedby="confirmation-description" aria-labelledby="confirmation-title" aria-modal="true" className="w-full max-w-md rounded-xl border bg-surface p-6 shadow-xl" role="dialog"><h2 className="text-lg font-semibold" id="confirmation-title">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground" id="confirmation-description">{description}</p>{details && <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">{details}</div>}<div className="mt-6 flex justify-end gap-2"><Button disabled={busy} onClick={onCancel} variant="outline">Cancel</Button><Button disabled={busy} onClick={onConfirm} variant={destructive ? "destructive" : "accent"}>{busy ? "Working…" : confirmLabel}</Button></div></section></div>;
}

