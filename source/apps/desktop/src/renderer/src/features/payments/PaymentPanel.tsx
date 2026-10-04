import { Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPaymentPreview, listSubscribers, postPayment, type PaymentPreview, type PaymentResult, type SubscriberListItem } from "@/lib/api-client";
import { PendingCommand } from "@/lib/pending-command";

type DirectMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";

export function PaymentPanel({ token, canPrint }: { token: string; canPrint: boolean }) {
  const [search, setSearch] = useState("");
  const [subscribers, setSubscribers] = useState<SubscriberListItem[]>([]);
  const [selected, setSelected] = useState<SubscriberListItem | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DirectMethod>("CASH");
  const [externalReference, setExternalReference] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [receivedConfirmed, setReceivedConfirmed] = useState(false);
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [posted, setPosted] = useState<PaymentResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingCommand = useRef(new PendingCommand());

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
    try {
      const reference = externalReference.trim().toUpperCase().replace(/[ -]/g, "");
      const description = otherDescription.trim();
      if (method !== "CASH" && (!/^[A-Z0-9]{6,40}$/.test(reference) || !receivedConfirmed)) throw new Error("Confirm receipt or clearing and enter a valid 6–40 character reference.");
      if (method === "OTHER" && (description.length < 10 || description.length > 200)) throw new Error("Describe the Other payment in 10–200 characters.");
      const commandKey = pendingCommand.current.keyFor(`${selected.id}:${preview.amountCentavos}:${method}:${reference}:${description}`);
      const result = await postPayment(token, { subscriberId: selected.id, amountCentavos: preview.amountCentavos, method, commandKey, ...(method === "CASH" ? {} : { externalReference: externalReference.trim(), receivedConfirmed: true as const }), ...(method === "OTHER" ? { otherDescription: description } : {}) });
      setPosted(result); setPreview(null); setError(""); pendingCommand.current.clear();
    }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  if (posted?.receipt) return <Receipt result={posted} canPrint={canPrint} onAnother={() => { pendingCommand.current.clear(); setPosted(null); setSelected(null); setAmount(""); setExternalReference(""); setOtherDescription(""); setReceivedConfirmed(false); setSubscribers([]); }} />;

  return <section className="rounded-xl border bg-surface p-6">
    <h2 className="text-lg font-semibold">Receive payment</h2>
    <p className="text-sm text-muted-foreground">Payments cover the oldest open invoice first. Any remainder becomes subscriber credit for a future bill.</p>
    <form className="mt-5 flex gap-2" onSubmit={searchSubscribers}><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search subscriber account or name" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button type="submit" variant="outline">Search</Button></form>
    {subscribers.length > 0 && <div className="mt-3 max-h-44 overflow-auto rounded-lg border">{subscribers.map((subscriber) => <button className={`block w-full border-b px-4 py-3 text-left text-sm last:border-0 ${selected?.id === subscriber.id ? "bg-accent/10" : "hover:bg-muted"}`} key={subscriber.id} disabled={busy || pendingCommand.current.hasPending} onClick={() => { setSelected(subscriber); setPreview(null); }} type="button"><span className="font-medium">{subscriber.accountNumber}</span> · {subscriber.firstName} {subscriber.lastName}</button>)}</div>}
    {selected && <div className="mt-5 rounded-lg border bg-muted/30 p-4"><p className="font-medium">{selected.firstName} {selected.lastName}</p><p className="text-sm text-muted-foreground">{selected.accountNumber}</p><div className="mt-3 grid max-w-xl gap-3"><label className="text-sm">Method<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" disabled={busy || pendingCommand.current.hasPending} value={method} onChange={(event) => { setMethod(event.target.value as DirectMethod); setPreview(null); setReceivedConfirmed(false); }}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque (cleared)</option><option value="OTHER">Other</option></select></label>{method !== "CASH" && <><label className="text-sm">Unique payment reference<Input className="mt-1" disabled={busy || pendingCommand.current.hasPending} maxLength={80} value={externalReference} onChange={(event) => { setExternalReference(event.target.value); setPreview(null); }} /></label>{method === "OTHER" && <label className="text-sm">Payment description<Input className="mt-1" disabled={busy || pendingCommand.current.hasPending} maxLength={200} value={otherDescription} onChange={(event) => { setOtherDescription(event.target.value); setPreview(null); }} /></label>}<label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={busy || pendingCommand.current.hasPending} checked={receivedConfirmed} onChange={(event) => { setReceivedConfirmed(event.target.checked); setPreview(null); }} /><span>I confirm the {method === "CHEQUE" ? "cheque has cleared" : "funds were received"} and checked this reference.</span></label></>}<div className="flex gap-2"><Input aria-label="Amount in PHP" disabled={busy || pendingCommand.current.hasPending} inputMode="decimal" placeholder="Amount in PHP" value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} /><Button disabled={busy || pendingCommand.current.hasPending} onClick={() => void prepare()} type="button" variant="accent">Preview allocation</Button></div></div></div>}
    {error && <p className="mt-4 text-sm text-danger">{error}{pendingCommand.current.hasPending && <span className="block">If the response was lost, retry the same payment. Do not start another until you check payment history.</span>}</p>}
    {preview && <div className="mt-5 rounded-lg border p-4"><div className="flex justify-between"><div><p className="font-medium">Allocation preview</p><p className="text-sm text-muted-foreground">Outstanding: {peso(preview.outstandingCentavos)}</p><p className="text-sm text-muted-foreground">Method: {method}{method !== "CASH" && ` · Reference: ${externalReference.trim()}`}</p></div><p className="text-xl font-semibold tabular-nums">{peso(preview.amountCentavos)}</p></div><div className="mt-3 divide-y rounded-md border">{preview.allocations.map((allocation) => <div className="flex justify-between p-3 text-sm" key={allocation.invoiceId}><span>{allocation.invoiceNumber}</span><span className="tabular-nums">{peso(allocation.amountCentavos)}</span></div>)}</div>{BigInt(preview.unallocatedCentavos) > 0n && <p className="mt-3 text-sm">Subscriber credit after payment: {peso(preview.unallocatedCentavos)}</p>}<Button className="mt-4" disabled={busy || preview.overpaymentBlocked || (method !== "CASH" && !receivedConfirmed)} onClick={() => void confirm()} variant="accent">Confirm and issue receipt</Button></div>}
  </section>;
}

function Receipt({ result, canPrint, onAnother }: { result: PaymentResult; canPrint: boolean; onAnother: () => void }) {
  const receipt = result.receipt;
  if (!receipt) return null;
  const snapshot = receipt.snapshot;
  const receiptAllocations = Array.isArray(snapshot.allocations) ? snapshot.allocations as Array<{ invoiceNumber: string; amountCentavos: string }> : [];
  return <section className="rounded-xl border bg-surface p-6"><div className="print-receipt mx-auto max-w-xl rounded-lg border bg-white p-8 text-black"><p className="text-center text-sm font-semibold">BCIS OFFICIAL RECEIPT</p><h2 className="mt-2 text-center text-2xl font-bold">{String(receipt.receiptNumber)}</h2><div className="mt-6 space-y-2 text-sm"><Row label="Account" value={String(snapshot.accountNumber)} /><Row label="Subscriber" value={String(snapshot.subscriberName)} /><Row label="Payment" value={String(snapshot.paymentNumber)} /><Row label="Method" value={String(snapshot.method)} />{Boolean(snapshot.externalReference) && <Row label="Payment reference" value={String(snapshot.externalReference)} />}{Boolean(snapshot.otherDescription) && <Row label="Payment description" value={String(snapshot.otherDescription)} />}<Row label="Amount received" value={peso(String(snapshot.amountCentavos))} /></div><div className="mt-5 border-t pt-4"><p className="text-sm font-medium">Applied invoices</p>{receiptAllocations.map((allocation) => <Row key={allocation.invoiceNumber} label={allocation.invoiceNumber} value={peso(allocation.amountCentavos)} />)}{BigInt(String(snapshot.advanceCreditCentavos ?? "0")) > 0n && <Row label="Subscriber credit" value={peso(String(snapshot.advanceCreditCentavos))} />}</div><p className="mt-6 text-center text-xs">System-generated receipt · {new Date(String(snapshot.issuedAt)).toLocaleString("en-PH")}</p></div><div className="mt-5 flex justify-center gap-2 print:hidden">{canPrint && <Button onClick={() => window.print()} variant="accent">Print receipt</Button>}<Button onClick={onAnother} variant="outline">Another payment</Button></div></section>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
function pesosToCentavos(value: string) { const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!match) throw new Error("Enter a valid peso amount."); const result = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0"); if (result <= 0n) throw new Error("Amount must be greater than zero."); return result.toString(); }
function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
