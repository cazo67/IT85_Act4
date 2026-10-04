import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInvoice, listInvoices, voidInvoice, type InvoiceDetail } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function InvoicesPanel({ token, openInvoiceId, canVoid }: { token: string; openInvoiceId?: string | undefined; canVoid: boolean }) {
  const [periodKey, setPeriodKey] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(openInvoiceId ?? "");
  const [voidReason, setVoidReason] = useState("");
  const [voidConfirming, setVoidConfirming] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState("");
  const invoices = useQuery({
    queryKey: queryKeys.billing.invoices(periodKey, invoiceNumber, page),
    queryFn: () => listInvoices(token, periodKey, page, invoiceNumber),
    enabled: !selectedId,
    staleTime: 0
  });
  const detail = useQuery({
    queryKey: queryKeys.billing.invoice(selectedId),
    queryFn: () => getInvoice(token, selectedId),
    enabled: Boolean(selectedId),
    staleTime: 0
  });

  function applySearch() {
    setPage(1);
    setInvoiceNumber(searchInput.trim());
  }

  async function confirmVoid() {
    if (!selectedId) return;
    setVoidBusy(true);
    try { await voidInvoice(token, selectedId, voidReason.trim()); setVoidConfirming(false); setVoidReason(""); setVoidError(""); await detail.refetch(); }
    catch (caught) { setVoidError(message(caught)); setVoidConfirming(false); }
    finally { setVoidBusy(false); }
  }

  if (selectedId) return <section className="rounded-xl border bg-surface p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Invoice detail</h2><p className="text-sm text-muted-foreground">Finalized charge and payment state, read-only</p></div>
      <Button onClick={() => setSelectedId("")} variant="outline">Back to invoices</Button>
    </div>
    {detail.isPending && <div className="mt-5"><LoadingState label="Loading invoice…" /></div>}
    {detail.isError && <div className="mt-5"><ErrorState message={message(detail.error)} onRetry={() => void detail.refetch()} /></div>}
    {detail.data && <><InvoiceDetailView data={detail.data} />{canVoid && detail.data.invoice.status === "OPEN" && detail.data.invoice.paidCentavos === "0" && <div className="mt-5 rounded-lg border p-4"><label className="block text-sm">Void reason (10–500 characters)<Input className="mt-2" maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label><Button className="mt-3" disabled={voidReason.trim().length < 10 || voidBusy} onClick={() => setVoidConfirming(true)} variant="destructive">Void unpaid invoice</Button></div>}{voidError && <p className="mt-3 text-sm text-danger" role="alert">{voidError}</p>}<ConfirmationDialog open={voidConfirming} title="Void this unpaid invoice?" description="The invoice remains in history. A compensating ledger credit removes its receivable; an invoice with any payment or credit history is rejected." details={<><p>{detail.data.invoice.invoiceNumber}</p><p>Reason: {voidReason.trim()}</p></>} confirmLabel="Void invoice" destructive busy={voidBusy} onCancel={() => setVoidConfirming(false)} onConfirm={() => void confirmVoid()} /></>}
  </section>;

  return <section className="rounded-xl border bg-surface p-6">
    <div><h2 className="text-lg font-semibold">Invoices</h2><p className="text-sm text-muted-foreground">Finalized monthly charges. Posted records are read-only.</p></div>
    <div className="mt-5 flex flex-wrap items-end gap-2">
      <label className="space-y-1 text-sm">Billing month<Input aria-label="Filter billing month" type="month" value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); setPage(1); }} /></label>
      <label className="min-w-56 flex-1 space-y-1 text-sm">Invoice number<Input aria-label="Search invoice number" maxLength={40} placeholder="INV-…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} /></label>
      <Button onClick={applySearch} variant="outline">Search</Button>
      <Button disabled={invoices.isFetching} onClick={() => void invoices.refetch()} variant="outline">Refresh</Button>
    </div>
    {invoices.isPending && <div className="mt-5"><LoadingState label="Loading invoices…" /></div>}
    {invoices.isError && <div className="mt-5"><ErrorState message={message(invoices.error)} onRetry={() => void invoices.refetch()} /></div>}
    {invoices.data && <>
      <div className="mt-5 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted"><tr><th className="px-4 py-3">Invoice</th><th>Subscriber</th><th>Service / plan</th><th>Date / due</th><th>Status</th><th className="text-right">Total</th><th className="pr-4 text-right">Outstanding</th></tr></thead>
          <tbody>{invoices.data.items.map((invoice) => <tr className="border-t" key={invoice.id}>
            <td className="px-4 py-3"><Button aria-label={`View invoice ${invoice.invoiceNumber}`} onClick={() => setSelectedId(invoice.id)} size="sm" variant="ghost">{invoice.invoiceNumber}</Button></td>
            <td>{invoice.subscriberAccountNumber}<span className="block text-xs text-muted-foreground">{invoice.subscriberName}</span></td>
            <td>{invoice.serviceAccountNumber}<span className="block text-xs text-muted-foreground">{invoice.planNameSnapshot}</span></td>
            <td>{invoice.invoiceDate}<span className="block text-xs text-muted-foreground">Due {invoice.dueDate}</span></td>
            <td>{invoice.status}</td>
            <td className="text-right tabular-nums">{peso(invoice.totalCentavos)}</td>
            <td className="pr-4 text-right tabular-nums">{peso(invoice.outstandingCentavos)}</td>
          </tr>)}</tbody>
        </table>
        {invoices.data.items.length === 0 && <EmptyState detail="Try a different month or invoice number." title="No invoices found" />}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Page {page}</p><div className="flex gap-2"><Button disabled={page === 1 || invoices.isFetching} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><Button disabled={!invoices.data.hasMore || invoices.isFetching} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div></div>
    </>}
  </section>;
}

function InvoiceDetailView({ data }: { data: InvoiceDetail }) {
  const invoice = data.invoice;
  return <div className="mt-5 space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Fact label="Invoice" value={invoice.invoiceNumber} />
      <Fact label="Subscriber" value={`${invoice.subscriberAccountNumber} · ${invoice.subscriberName}`} />
      <Fact label="Service" value={invoice.serviceAccountNumber} />
      <Fact label="Status" value={invoice.status} />
      <Fact label="Invoice date" value={invoice.invoiceDate} />
      <Fact label="Due date" value={invoice.dueDate} />
      <Fact label="Plan at billing" value={`${invoice.planCodeSnapshot} · ${invoice.planNameSnapshot}`} />
    </div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Charge</th><th>Quantity</th><th className="text-right">Unit</th><th className="pr-4 text-right">Total</th></tr></thead><tbody>{data.items.map((item) => <tr className="border-t" key={item.id}><td className="px-4 py-3">{item.description}</td><td>{item.quantity}</td><td className="text-right tabular-nums">{peso(item.unitAmountCentavos)}</td><td className="pr-4 text-right tabular-nums">{peso(item.totalCentavos)}</td></tr>)}</tbody></table></div>
    <div className="grid gap-3 sm:grid-cols-3"><Fact label="Billed" value={peso(invoice.totalCentavos)} /><Fact label="Paid" value={peso(invoice.paidCentavos)} /><Fact label="Outstanding" value={peso(invoice.outstandingCentavos)} /></div>
    {data.voidRecord && <p className="text-sm">Voided {new Date(data.voidRecord.voidedAt).toLocaleString("en-PH")}. Reason: {data.voidRecord.reason}</p>}
    <p className="text-xs text-muted-foreground">Amounts and outstanding balance are calculated by the server. A void retains the invoice and adds a compensating ledger credit.</p>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium tabular-nums">{value}</p></div>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Invoices could not be loaded."; }
function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
