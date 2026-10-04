import { Button } from "@/components/ui/button";
import type { PaymentResult } from "@/lib/api-client";

export function ReceiptView({ result, canPrint, onClose, closeLabel = "Close" }: { result: PaymentResult; canPrint: boolean; onClose: () => void; closeLabel?: string }) {
  const receipt = result.receipt;
  if (!receipt) return <p className="text-sm text-muted-foreground">No receipt is available for this payment.</p>;
  const snapshot = receipt.snapshot;
  const originalAllocations = Array.isArray(snapshot.allocations) ? snapshot.allocations as Array<{ invoiceNumber: string; amountCentavos: string }> : [];
  const voided = Boolean(receipt.voidedAt) || result.payment.status === "REVERSED";
  return <section className="rounded-xl border bg-surface p-6">
    <div className="print-receipt mx-auto max-w-xl rounded-lg border bg-white p-8 text-black">
      <p className="text-center text-sm font-semibold">BCIS OFFICIAL RECEIPT</p>
      <h2 className="mt-2 text-center text-2xl font-bold">{receipt.receiptNumber}</h2>
      {voided && <p className="mt-2 border border-red-600 py-2 text-center font-bold text-red-700">VOIDED — PAYMENT REVERSED</p>}
      <div className="mt-6 space-y-2 text-sm">
        <Row label="Account" value={String(snapshot.accountNumber ?? "")} />
        <Row label="Subscriber" value={String(snapshot.subscriberName ?? "")} />
        <Row label="Payment" value={String(snapshot.paymentNumber ?? "")} />
        <Row label="Method" value={String(snapshot.method ?? "")} />
        {Boolean(snapshot.externalReference) && <Row label={snapshot.method === "GCASH" ? "GCash reference" : "Payment reference"} value={String(snapshot.externalReference)} />}
        {Boolean(snapshot.otherDescription) && <Row label="Payment description" value={String(snapshot.otherDescription)} />}
        <Row label="Amount received" value={peso(String(snapshot.amountCentavos ?? "0"))} />
      </div>
      <div className="mt-5 border-t pt-4"><p className="text-sm font-medium">Applied invoices at posting</p>{originalAllocations.map((allocation) => <Row key={allocation.invoiceNumber} label={allocation.invoiceNumber} value={peso(allocation.amountCentavos)} />)}{BigInt(String(snapshot.advanceCreditCentavos ?? "0")) > 0n && <Row label="Subscriber credit at posting" value={peso(String(snapshot.advanceCreditCentavos))} />}</div>
      <p className="mt-6 text-center text-xs">System-generated receipt · {new Date(String(snapshot.issuedAt)).toLocaleString("en-PH")}</p>
      {voided && <p className="mt-2 text-center text-xs">Voided {new Date(receipt.voidedAt ?? result.payment.paidAt).toLocaleString("en-PH")}</p>}
    </div>
    <div className="mt-5 flex justify-center gap-2 print:hidden">{canPrint && <Button onClick={() => window.print()} variant="accent">{voided ? "Print voided copy" : "Print receipt"}</Button>}<Button onClick={onClose} variant="outline">{closeLabel}</Button></div>
  </section>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
