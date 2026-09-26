import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getDashboard, type DashboardData } from "@/lib/api-client";

const today = new Date().toISOString().slice(0, 10);

export function DashboardOverview({ token }: { token: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setData(await getDashboard(token, asOf)); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Dashboard totals are unavailable."); } }, [asOf, token]);
  useEffect(() => { void load(); }, [load]);
  return <div className="mt-7 border-t pt-6"><div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold">Operational summary</h2><p className="text-xs text-muted-foreground">Server-calculated values for the selected date.</p></div><div className="flex items-end gap-2"><label className="text-xs">As of<input className="ml-2 h-9 rounded-md border bg-background px-2" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label><Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button></div></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}{data && <><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Billed this month" value={peso(data.billedCentavos)} note={`${data.billedInvoiceCount} invoices`} /><Metric label="Collected this month" value={peso(data.collectedCentavos)} note={`${data.paymentCount} payments`} /><Metric label="Total outstanding" value={peso(data.outstandingCentavos)} note={`${data.outstandingInvoiceCount} invoices`} /><Metric label="Active services" value={data.activeServiceCount.toLocaleString()} note={`${data.suspendedServiceCount} suspended`} /><Metric label="Open batches" value={data.openBatchCount.toLocaleString()} note="Not yet closed" /><Metric label="AR 91+ days" value={peso(data.aging.days91PlusCentavos)} note={`As of ${data.asOf}`} /></div><div className="mt-4 grid grid-cols-5 overflow-hidden rounded-full" aria-label="Accounts receivable aging distribution">{agingParts(data).map((part) => <div className={`h-2 ${part.color}`} key={part.label} style={{ width: "100%" }} title={`${part.label}: ${peso(part.value)}`} />)}</div></>}</div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>; }
function peso(value: string) { const amount = BigInt(value); return `₱${(amount / 100n).toLocaleString("en-PH")}.${(amount % 100n).toString().padStart(2, "0")}`; }
function agingParts(data: DashboardData) { return [{ label: "Current", value: data.aging.currentCentavos, color: "bg-success" }, { label: "1–30", value: data.aging.days1To30Centavos, color: "bg-accent" }, { label: "31–60", value: data.aging.days31To60Centavos, color: "bg-warning" }, { label: "61–90", value: data.aging.days61To90Centavos, color: "bg-orange-600" }, { label: "91+", value: data.aging.days91PlusCentavos, color: "bg-danger" }]; }
