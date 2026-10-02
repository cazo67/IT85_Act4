import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, getAgingSummary, getReceivableFilterOptions, listOverdueAccounts, listReceivables, type AgingSummary, type OverdueAccountItem, type ReceivableFilterOptions, type ReceivableFilters, type ReceivableItem } from "@/lib/api-client";

const buckets = [
  { value: "CURRENT", label: "Current" }, { value: "DAYS_1_30", label: "1–30 days" },
  { value: "DAYS_31_60", label: "31–60 days" }, { value: "DAYS_61_90", label: "61–90 days" },
  { value: "DAYS_91_PLUS", label: "91+ days" }
] as const;

export function ReceivableOverview({ token, asOf, onAsOfChange }: { token: string; asOf: string; onAsOfChange: (value: string) => void }) {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [view, setView] = useState<"invoices" | "accounts">("invoices");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ReceivableFilters>({});
  const [searchInput, setSearchInput] = useState("");
  const [bucketInput, setBucketInput] = useState("");
  const [areaInput, setAreaInput] = useState("");
  const [collectorInput, setCollectorInput] = useState("");
  const [planInput, setPlanInput] = useState("");
  const [typeInput, setTypeInput] = useState("");
  const [options, setOptions] = useState<ReceivableFilterOptions | null>(null);
  const [rows, setRows] = useState<ReceivableItem[]>([]);
  const [accountRows, setAccountRows] = useState<OverdueAccountItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => { void getReceivableFilterOptions(token).then(setOptions).catch((caught: unknown) => setError(message(caught))); }, [token]);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([view === "accounts" ? listOverdueAccounts(token, asOf, page, filters) : listReceivables(token, asOf, overdueOnly, page, filters), getAgingSummary(token, asOf)]);
      if (currentRequest === requestId.current) {
        if (view === "accounts") setAccountRows(list.items as OverdueAccountItem[]);
        else setRows(list.items as ReceivableItem[]);
        setHasMore(list.hasMore); setAging(summary); setError("");
      }
    } catch (caught) { if (currentRequest === requestId.current) setError(message(caught)); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [asOf, filters, overdueOnly, page, token, view]);
  useEffect(() => { void load(); }, [load]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...(searchInput.trim() ? { search: searchInput.trim() } : {}), ...(bucketInput ? { bucket: bucketInput as ReceivableItem["ageBucket"] } : {}), ...(areaInput ? { areaId: areaInput } : {}), ...(collectorInput ? { collectorId: collectorInput } : {}), ...(planInput ? { planId: planInput } : {}), ...(typeInput ? { serviceTypeId: typeInput } : {}) });
  }

  return <section className="min-w-0 rounded-xl border bg-surface p-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Receivables and AR aging</h2><p className="text-sm text-muted-foreground">Server-calculated balances at the selected as-of date. Filters apply to the selected list; aging cards show all accounts.</p></div><label className="text-sm">As of<Input aria-label="Receivables as of" type="date" value={asOf} onChange={(event) => { onAsOfChange(event.target.value); setPage(1); }} /></label></div>
    {aging && <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Current" value={peso(aging.currentCentavos)} /><Metric label="1–30 days" value={peso(aging.days1To30Centavos)} /><Metric label="31–60 days" value={peso(aging.days31To60Centavos)} /><Metric label="61–90 days" value={peso(aging.days61To90Centavos)} /><Metric label="91+ days" value={peso(aging.days91PlusCentavos)} /><Metric label="Total" value={peso(aging.totalCentavos)} /></div>}
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Receivables view"><Button aria-pressed={view === "invoices"} onClick={() => { setView("invoices"); setPage(1); }} size="sm" variant={view === "invoices" ? "accent" : "outline"}>Invoice detail</Button><Button aria-pressed={view === "accounts"} onClick={() => { setView("accounts"); setPage(1); }} size="sm" variant={view === "accounts" ? "accent" : "outline"}>Overdue accounts</Button></div>
    <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={apply}>
      <label className="text-sm">Search<Input aria-label="Search receivables" placeholder="Account, name, invoice or service" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <Select label="Age bucket" value={bucketInput} onChange={setBucketInput} options={buckets.map((item) => ({ id: item.value, name: item.label }))} />
      <Select label="Area" value={areaInput} onChange={setAreaInput} options={options?.areas ?? []} />
      <Select label="Collector" value={collectorInput} onChange={setCollectorInput} options={options?.collectors ?? []} />
      <Select label="Plan" value={planInput} onChange={setPlanInput} options={options?.plans.map((item) => ({ id: item.id, name: `${item.code} · ${item.name}` })) ?? []} />
      <Select label="Service type" value={typeInput} onChange={setTypeInput} options={options?.serviceTypes ?? []} />
      {view === "invoices" && <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={overdueOnly} onChange={(event) => { setOverdueOnly(event.target.checked); setPage(1); }} />Overdue only</label>}
      <div className="flex items-end gap-2"><Button disabled={loading} type="submit" variant="accent">Apply filters</Button><Button disabled={loading} onClick={() => void load()} type="button" variant="outline">Refresh</Button></div>
    </form>
    {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}{loading && <p className="mt-3 text-sm text-muted-foreground">Loading receivables…</p>}
    {view === "accounts" ? <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-3">Subscriber / service</th><th>Area / collector</th><th>Months unpaid</th><th>Oldest unpaid invoice</th><th>Days late</th><th>Last payment</th><th className="pr-3 text-right">Total arrears</th></tr></thead><tbody>{accountRows.map((row) => <tr className="border-t" key={row.serviceAccountId}><td className="px-3 py-3"><span className="block font-medium">{row.accountNumber} · {row.subscriberName}</span><span>{row.serviceAccountNumber} · {row.serviceStatus}</span></td><td><span className="block">{row.areaName ?? "Unassigned area"}</span><span className="text-muted-foreground">{row.collectorName ?? "Unassigned collector"}</span></td><td>{row.monthsUnpaid}</td><td><span className="block">{row.oldestUnpaidInvoice}</span><span className="text-muted-foreground">Due {row.oldestDueDate} · {row.overdueInvoiceCount} invoice(s)</span></td><td>{row.maximumDaysPastDue}</td><td>{row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString("en-PH") : "—"}</td><td className="pr-3 text-right tabular-nums">{peso(row.totalArrearsCentavos)}</td></tr>)}{!loading && !error && accountRows.length === 0 && <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>No matching overdue accounts.</td></tr>}</tbody></table></div> : <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-3">Invoice / subscriber</th><th>Service / plan</th><th>Area / collector</th><th>Due date</th><th>Age</th><th>Last payment</th><th className="pr-3 text-right">Outstanding</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.invoiceId}><td className="px-3 py-3"><span className="block font-medium">{row.invoiceNumber}</span><span>{row.accountNumber} · {row.subscriberName}</span></td><td><span className="block">{row.serviceAccountNumber} · {row.serviceTypeName}</span><span className="text-muted-foreground">{row.planCode} · {row.planName}</span></td><td><span className="block">{row.areaName ?? "Unassigned area"}</span><span className="text-muted-foreground">{row.collectorName ?? "Unassigned collector"}</span></td><td>{row.dueDate}</td><td><span className="block">{row.daysPastDue} days</span><span className="text-muted-foreground">{buckets.find((item) => item.value === row.ageBucket)?.label}</span></td><td>{row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString("en-PH") : "—"}</td><td className="pr-3 text-right tabular-nums">{peso(row.remainingCentavos)}</td></tr>)}{!loading && !error && rows.length === 0 && <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>No matching receivables.</td></tr>}</tbody></table></div>}
    <div className="mt-3 flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page}</p><div className="flex gap-2"><Button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><Button disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div></div>
  </section>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }> }) { return <label className="text-sm">{label}<select aria-label={label} className="block h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>; }
function peso(value: string) { const amount = BigInt(value); return `₱${(amount / 100n).toLocaleString("en-PH")}.${(amount % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : "The receivables request failed."; }
