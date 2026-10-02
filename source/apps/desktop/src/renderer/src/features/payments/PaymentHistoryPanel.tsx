import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, getPayment, listPayments, listSubscribers, reversePayment, type PaymentResult, type SubscriberListItem } from "@/lib/api-client";
import { ReceiptView } from "./ReceiptView";

type PaymentRow = { payment: PaymentResult["payment"]; receiptNumber: string | null };

export function PaymentHistoryPanel({ token, canReverse, canPrint }: { token: string; canReverse: boolean; canPrint: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [matches, setMatches] = useState<SubscriberListItem[]>([]);
  const [subscriber, setSubscriber] = useState<SubscriberListItem | null>(null);
  const [detail, setDetail] = useState<PaymentResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listPayments(token, page, subscriber?.id);
      setRows(result.items);
      setHasMore(result.hasMore);
      setError("");
    } catch (caught) { setError(message(caught)); }
    finally { setLoading(false); }
  }, [page, subscriber?.id, token]);
  useEffect(() => { void load(); }, [load]);

  async function searchSubscribers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try { setMatches((await listSubscribers(token, subscriberSearch.trim())).items); setError(""); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  async function openDetail(paymentId: string) {
    setBusy(true);
    try { setDetail(await getPayment(token, paymentId)); setError(""); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  async function reverse() {
    setBusy(true);
    try {
      await reversePayment(token, selectedId, reason.trim());
      setConfirmOpen(false);
      setSelectedId("");
      setReason("");
      await load();
    } catch (caught) { setError(message(caught)); setConfirmOpen(false); }
    finally { setBusy(false); }
  }

  if (detail) return <div className="space-y-4"><Button onClick={() => setDetail(null)} variant="outline">Back to payment history</Button><ReceiptView result={detail} canPrint={canPrint} onClose={() => setDetail(null)} closeLabel="Back to history" /></div>;

  return <section className="min-w-0 rounded-xl border bg-surface p-6">
    <h2 className="text-lg font-semibold">Payment history</h2>
    <p className="text-sm text-muted-foreground">Posted payments and compensating reversals remain visible. A reversed receipt is marked void.</p>
    <form className="mt-5 flex flex-wrap gap-2" onSubmit={searchSubscribers}>
      <Input aria-label="Search payment subscriber" className="min-w-48 flex-1" placeholder="Search subscriber account or name" value={subscriberSearch} onChange={(event) => setSubscriberSearch(event.target.value)} />
      <Button disabled={busy} type="submit" variant="outline">Search subscribers</Button>
      {subscriber && <Button onClick={() => { setSubscriber(null); setMatches([]); setPage(1); }} type="button" variant="outline">Show all payments</Button>}
    </form>
    {matches.length > 0 && <div className="mt-2 max-h-40 overflow-auto rounded-lg border">{matches.map((match) => <button className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted" key={match.id} onClick={() => { setSubscriber(match); setMatches([]); setPage(1); }} type="button">{match.accountNumber} · {match.firstName} {match.lastName}</button>)}</div>}
    {subscriber && <p className="mt-3 text-sm">Showing payments for <strong>{subscriber.accountNumber} · {subscriber.firstName} {subscriber.lastName}</strong></p>}
    {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    {loading && <p className="mt-4 text-sm text-muted-foreground">Loading payments…</p>}
    <div className="mt-5 overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Payment</th><th>Receipt</th><th>Method</th><th>Status</th><th>Date</th><th className="text-right">Amount</th><th className="pr-4 text-right">Actions</th></tr></thead><tbody>{rows.map(({ payment, receiptNumber }) => <tr className="border-t" key={payment.id}><td className="px-4 py-3 font-medium">{payment.paymentNumber}</td><td>{receiptNumber ?? "—"}{payment.status === "REVERSED" && <span className="block text-xs text-danger">Voided</span>}</td><td>{payment.method}</td><td>{payment.status}</td><td>{new Date(payment.paidAt).toLocaleString("en-PH")}</td><td className="text-right tabular-nums">{peso(payment.amountCentavos)}</td><td className="space-x-2 whitespace-nowrap pr-4 text-right"><Button aria-label={`View payment ${payment.paymentNumber}`} disabled={busy} onClick={() => void openDetail(payment.id)} size="sm" variant="outline">View receipt</Button>{canReverse && payment.status === "POSTED" && <Button aria-label={`Reverse payment ${payment.paymentNumber}`} disabled={busy} onClick={() => { setSelectedId(payment.id); setReason(""); }} size="sm" variant="outline">Reverse</Button>}</td></tr>)}{!loading && rows.length === 0 && <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>No payments found.</td></tr>}</tbody></table></div>
    <div className="mt-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page}</p><div className="flex gap-2"><Button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><Button disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div></div>
    {canReverse && selectedId && <form className="mt-5 rounded-lg border border-danger/30 bg-danger/5 p-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 10) setConfirmOpen(true); }}><p className="font-medium">Reverse posted payment</p><p className="text-sm text-muted-foreground">The original payment and voided receipt remain in history; a compensating ledger debit restores balances.</p><Input aria-label="Reversal reason" className="mt-3" minLength={10} maxLength={500} placeholder="Reason (at least 10 characters)" required value={reason} onChange={(event) => setReason(event.target.value)} /><div className="mt-3 flex gap-2"><Button disabled={busy} type="submit" variant="destructive">Review reversal</Button><Button onClick={() => { setSelectedId(""); setReason(""); }} type="button" variant="outline">Cancel</Button></div></form>}
    <ConfirmationDialog open={confirmOpen} title="Confirm payment reversal?" description="This will void the receipt and add a compensating ledger debit. The original payment remains in history." confirmLabel="Reverse payment" destructive busy={busy} onConfirm={() => void reverse()} onCancel={() => setConfirmOpen(false)} />
  </section>;
}

function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : "Payment history could not be loaded."; }
