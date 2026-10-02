import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { getDashboard, type DashboardData } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DashboardOverview({ token }: { token: string }) {
  const [asOf, setAsOf] = useState(localToday);
  const dashboard = useQuery({ queryKey: queryKeys.dashboard(asOf), queryFn: () => getDashboard(token, asOf), enabled: Boolean(asOf) });
  const data = dashboard.data;
  return <section className="mt-7 min-w-0 border-t pt-6" aria-label="Operational summary">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Operational summary</h2><p className="text-xs text-muted-foreground">Server-calculated values for the selected date.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs">As of<input className="ml-2 h-9 rounded-md border bg-background px-2" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label><Button disabled={dashboard.isFetching || !asOf} size="sm" variant="outline" onClick={() => void dashboard.refetch()}>Refresh</Button></div></div>
    {!asOf && <p className="mt-4 text-sm text-muted-foreground">Select a date to view the dashboard.</p>}
    {dashboard.isPending && asOf && <div className="mt-4"><LoadingState label="Loading dashboard totals…" /></div>}
    {dashboard.isError && <div className="mt-4"><ErrorState message={dashboard.error instanceof Error ? dashboard.error.message : "Dashboard totals are unavailable."} onRetry={() => void dashboard.refetch()} /></div>}
    {data && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Billed this month" value={peso(data.billedCentavos)} note={`${data.billedInvoiceCount} invoices`} /><Metric label="Collected this month" value={peso(data.collectedCentavos)} note={`${data.paymentCount} payments`} /><Metric label="Total outstanding" value={peso(data.outstandingCentavos)} note={`${data.outstandingInvoiceCount} invoices`} /><Metric label="Active services" value={data.activeServiceCount.toLocaleString()} note={`${data.suspendedServiceCount} suspended`} /><Metric label="Open batches" value={data.openBatchCount.toLocaleString()} note="Current batches not yet closed" /><Metric label="AR 91+ days" value={peso(data.aging.days91PlusCentavos)} note={`As of ${data.asOf}`} /></div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full" aria-label="Accounts receivable aging distribution">{agingParts(data).map((part) => <div className={part.color} key={part.label} style={{ flexGrow: Number(BigInt(part.value) * 1000n / (BigInt(data.outstandingCentavos) || 1n)) }} title={`${part.label}: ${peso(part.value)}`} />)}</div>
      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
        <Summary title="Billing versus collection" note="Month to selected date; collections can include older invoices."><div className="grid grid-cols-2 gap-2 text-sm"><span>Billed</span><strong className="text-right tabular-nums">{peso(data.billedCentavos)}</strong><span>Collected</span><strong className="text-right tabular-nums">{peso(data.collectedCentavos)}</strong><span>Difference</span><strong className="text-right tabular-nums">{peso((BigInt(data.billedCentavos) - BigInt(data.collectedCentavos)).toString())}</strong></div></Summary>
        <Summary title="Payment methods" note="Posted payments, month to selected date; reversals excluded.">{data.paymentMethods.length ? <div className="space-y-2">{data.paymentMethods.map((row) => <div className="flex justify-between gap-2 text-sm" key={row.method}><span>{row.method} · {row.paymentCount} payments</span><strong className="tabular-nums">{peso(row.amountCentavos)}</strong></div>)}</div> : <Empty />}</Summary>
        <Summary title="Collector performance" note="Current totals of batches dated in the selected month; not a historical snapshot.">{data.collectorPerformance.length ? <div className="space-y-2">{data.collectorPerformance.map((row) => <div className="flex flex-wrap justify-between gap-x-3 border-b pb-2 text-sm last:border-0" key={row.collectorId}><span className="font-medium">{row.collectorName} · {row.batchCount} batches</span><span className="tabular-nums">Collected {peso(row.collectedCentavos)} / Expected {peso(row.expectedCentavos)} · Remitted {peso(row.remittedCentavos)}</span></div>)}</div> : <Empty />}</Summary>
        <Summary title="Overdue alerts" note={`Oldest due dates as of ${data.asOf}.`}>{data.overdueAlerts.length ? <div className="space-y-2">{data.overdueAlerts.map((row) => <div className="flex flex-wrap justify-between gap-x-3 border-b pb-2 text-sm last:border-0" key={row.serviceAccountNumber}><span><span className="font-medium">{row.accountNumber}</span> · {row.subscriberName}<span className="block text-xs text-muted-foreground">{row.serviceAccountNumber} · {row.maximumDaysPastDue} days past due</span></span><strong className="tabular-nums">{peso(row.totalArrearsCentavos)}</strong></div>)}{data.hasMoreOverdue && <p className="text-xs text-muted-foreground">More accounts are overdue; open Receivables for the full list.</p>}</div> : <Empty />}</Summary>
        <Summary title="Recent payments" note={`Latest posted payments through ${data.asOf}; reversals excluded.`}>{data.recentPayments.length ? <div className="space-y-2">{data.recentPayments.map((row) => <div className="flex flex-wrap justify-between gap-x-3 border-b pb-2 text-sm last:border-0" key={row.paymentNumber}><span><span className="font-medium">{row.paymentNumber}</span> · {row.accountNumber}<span className="block text-xs text-muted-foreground">{row.subscriberName} · {row.method} · {row.paidAt.slice(0, 10)}</span></span><strong className="tabular-nums">{peso(row.amountCentavos)}</strong></div>)}</div> : <Empty />}</Summary>
      </div>
    </>}
  </section>;
}

function Summary({ title, note, children }: { title: string; note: string; children: ReactNode }) { return <section className="min-w-0 rounded-lg border bg-background p-4"><h3 className="font-semibold">{title}</h3><p className="mb-3 text-xs text-muted-foreground">{note}</p>{children}</section>; }
function Empty() { return <p className="text-sm text-muted-foreground">No records for this period.</p>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>; }
function peso(value: string) { const amount = BigInt(value); const absolute = amount < 0n ? -amount : amount; return `${amount < 0n ? "−" : ""}₱${(absolute / 100n).toLocaleString("en-PH")}.${(absolute % 100n).toString().padStart(2, "0")}`; }
function agingParts(data: DashboardData) { return [{ label: "Current", value: data.aging.currentCentavos, color: "bg-success" }, { label: "1–30", value: data.aging.days1To30Centavos, color: "bg-accent" }, { label: "31–60", value: data.aging.days31To60Centavos, color: "bg-warning" }, { label: "61–90", value: data.aging.days61To90Centavos, color: "bg-orange-600" }, { label: "91+", value: data.aging.days91PlusCentavos, color: "bg-danger" }]; }
