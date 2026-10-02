import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="rounded-xl border bg-surface p-8 text-sm text-muted-foreground" role="status">{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="rounded-xl border border-danger/30 bg-danger/5 p-6" role="alert"><p className="text-sm text-danger">{message}</p>{onRetry && <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">Try again</Button>}</div>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="px-4 py-10 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

