import { useState } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, finalizeBilling, getBillingPreview, type BillingPreview } from "@/lib/api-client";

export function BillingPanel({ token, canGenerate }: { token: string; canGenerate: boolean }) {
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function loadPreview() {
    setBusy(true);
    try { setPreview(await getBillingPreview(token, periodKey)); setResult(""); setError(""); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Billing preview could not be loaded."); }
    finally { setBusy(false); }
  }

  async function finalize() {
    setBusy(true);
    try { const summary = await finalizeBilling(token, periodKey, crypto.randomUUID()); setResult(`${summary.invoiceCount} invoices finalized for ${peso(summary.totalCentavos)}.`); setPreview(await getBillingPreview(token, periodKey)); setError(""); setConfirming(false); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Billing could not be finalized."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border bg-surface p-6"><div><h2 className="text-lg font-semibold">Monthly billing</h2><p className="text-sm text-muted-foreground">Preview first. Finalization creates immutable invoices and matching ledger debits in one transaction.</p></div><div className="mt-5 flex max-w-md gap-2"><Input aria-label="Billing month" type="month" value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); setPreview(null); setResult(""); }} /><Button disabled={busy} onClick={() => void loadPreview()} variant="outline">Preview</Button></div>{error && <p className="mt-4 text-sm text-danger">{error}</p>}{result && <p className="mt-4 text-sm text-success">{result}</p>}{preview && <><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Eligible services" value={String(preview.eligibleCount)} /><Metric label="Pending invoices" value={String(preview.pendingCount)} /><Metric label="Pending total" value={peso(preview.totalCentavos)} /></div><div className="mt-5 max-h-80 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="px-4 py-3">Service</th><th>Subscriber</th><th>Plan</th><th>Due</th><th className="pr-4 text-right">Amount</th></tr></thead><tbody>{preview.items.map((item) => <tr className="border-t" key={item.serviceAccountId}><td className="px-4 py-3">{item.serviceAccountNumber}</td><td>{item.subscriberName}</td><td>{item.planName}</td><td>{item.alreadyBilled ? "Already billed" : item.dueDate}</td><td className="pr-4 text-right tabular-nums">{peso(item.amountCentavos)}</td></tr>)}</tbody></table></div>{canGenerate && preview.pendingCount > 0 && <div className="mt-5 rounded-lg border border-warning/40 bg-warning/10 p-4"><p className="font-medium">Final billing for {periodKey}</p><p className="mt-1 text-sm text-muted-foreground">This will create {preview.pendingCount} immutable invoices totaling {peso(preview.totalCentavos)}.</p><Button className="mt-3" disabled={busy} onClick={() => setConfirming(true)} variant="accent">Review and finalize</Button></div>}<ConfirmationDialog busy={busy} confirmLabel="Finalize billing" description="Finalization creates immutable invoices and ledger debits. Review the period and totals before continuing." details={<><p>Period: <strong>{periodKey}</strong></p><p>Invoices: <strong>{preview.pendingCount}</strong></p><p>Total: <strong>{peso(preview.totalCentavos)}</strong></p></>} onCancel={() => setConfirming(false)} onConfirm={() => void finalize()} open={confirming} title="Finalize monthly billing?" /></>}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>; }
function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
