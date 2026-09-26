import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, getPaymentPreview, listSubscribers, postPayment, type PaymentPreview, type PaymentResult, type SubscriberListItem } from "@/lib/api-client";

export function PaymentPanel({ token, canPrint }: { token: string; canPrint: boolean }) {
  const [search, setSearch] = useState("");
  const [subscribers, setSubscribers] = useState<SubscriberListItem[]>([]);
  const [selected, setSelected] = useState<SubscriberListItem | null>(null);
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [posted, setPosted] = useState<PaymentResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function searchSubscribers(event: FormEvent) {
    event.preventDefault();
    try { setSubscribers((await listSubscribers(token, search)).items); setError(""); }
    catch (caught) { setError(message(caught)); }
  }

  async function prepare() {
    if (!selected) return;
    try { setPreview(await getPaymentPreview(token, selected.id, pesosToCentavos(amount))); setPosted(null); setError(""); }
    catch (caught) { setError(message(caught)); }
  }

  async function confirm() {
    if (!selected || !preview) return;
    setBusy(true);
    try { setPosted(await postPayment(token, { subscriberId: selected.id, amountCentavos: preview.amountCentavos, method: "CASH", commandKey: crypto.randomUUID() })); setPreview(null); setError(""); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  if (posted?.receipt) return <Receipt result={posted} canPrint={canPrint} onAnother={() => { setPosted(null); setSelected(null); setAmount(""); setSubscribers([]); }} />;

  return <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Receive cash payment</h2><p className="text-sm text-muted-foreground">Payments are allocated to the oldest open invoice first. Overpayments remain blocked until the advance-credit policy is approved.</p><form className="mt-5 flex gap-2" onSubmit={searchSubscribers}><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search subscriber account or name" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button type="submit" variant="outline">Search</Button></form>{subscribers.length > 0 && <div className="mt-3 max-h-44 overflow-auto rounded-lg border">{subscribers.map((subscriber) => <button className={`block w-full border-b px-4 py-3 text-left text-sm last:border-0 ${selected?.id === subscriber.id ? "bg-accent/10" : "hover:bg-muted"}`} key={subscriber.id} onClick={() => { setSelected(subscriber); setPreview(null); }} type="button"><span className="font-medium">{subscriber.accountNumber}</span> · {subscriber.firstName} {subscriber.lastName}</button>)}</div>}{selected && <div className="mt-5 rounded-lg border bg-muted/30 p-4"><p className="font-medium">{selected.firstName} {selected.lastName}</p><p className="text-sm text-muted-foreground">{selected.accountNumber}</p><div className="mt-3 flex max-w-md gap-2"><Input inputMode="decimal" placeholder="Amount in PHP" value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} /><Button onClick={() => void prepare()} type="button" variant="accent">Preview allocation</Button></div></div>}{error && <p className="mt-4 text-sm text-danger">{error}</p>}{preview && <div className="mt-5 rounded-lg border p-4"><div className="flex justify-between"><div><p className="font-medium">Allocation preview</p><p className="text-sm text-muted-foreground">Outstanding: {peso(preview.outstandingCentavos)}</p></div><p className="text-xl font-semibold tabular-nums">{peso(preview.amountCentavos)}</p></div><div className="mt-3 divide-y rounded-md border">{preview.allocations.map((allocation) => <div className="flex justify-between p-3 text-sm" key={allocation.invoiceId}><span>{allocation.invoiceNumber}</span><span className="tabular-nums">{peso(allocation.amountCentavos)}</span></div>)}</div>{preview.overpaymentBlocked ? <p className="mt-3 text-sm text-danger">Unallocated amount {peso(preview.unallocatedCentavos)} cannot be posted.</p> : <Button className="mt-4" disabled={busy} onClick={() => void confirm()} variant="accent">Confirm and issue receipt</Button>}</div>}</section>;
}

function Receipt({ result, canPrint, onAnother }: { result: PaymentResult; canPrint: boolean; onAnother: () => void }) {
  const receipt = result.receipt;
  if (!receipt) return null;
  const snapshot = receipt.snapshot;
  return <section className="rounded-xl border bg-surface p-6"><div className="print-receipt mx-auto max-w-xl rounded-lg border bg-white p-8 text-black"><p className="text-center text-sm font-semibold">BCIS OFFICIAL RECEIPT</p><h2 className="mt-2 text-center text-2xl font-bold">{String(receipt.receiptNumber)}</h2><div className="mt-6 space-y-2 text-sm"><Row label="Account" value={String(snapshot.accountNumber)} /><Row label="Subscriber" value={String(snapshot.subscriberName)} /><Row label="Payment" value={String(snapshot.paymentNumber)} /><Row label="Method" value={String(snapshot.method)} /><Row label="Amount received" value={peso(String(snapshot.amountCentavos))} /></div><div className="mt-5 border-t pt-4"><p className="text-sm font-medium">Applied invoices</p>{result.allocations.map((allocation) => <Row key={allocation.invoiceNumber} label={allocation.invoiceNumber} value={peso(allocation.amountCentavos)} />)}</div><p className="mt-6 text-center text-xs">System-generated receipt · {new Date(String(snapshot.issuedAt)).toLocaleString("en-PH")}</p></div><div className="mt-5 flex justify-center gap-2 print:hidden">{canPrint && <Button onClick={() => window.print()} variant="accent">Print receipt</Button>}<Button onClick={onAnother} variant="outline">Another payment</Button></div></section>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
function pesosToCentavos(value: string) { const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!match) throw new Error("Enter a valid peso amount."); const result = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0"); if (result <= 0n) throw new Error("Amount must be greater than zero."); return result.toString(); }
function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
