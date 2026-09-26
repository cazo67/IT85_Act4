import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, listPayments, reversePayment, type PaymentResult } from "@/lib/api-client";

type PaymentRow = { payment: PaymentResult["payment"]; receiptNumber: string | null };

export function PaymentHistoryPanel({ token, canReverse }: { token: string; canReverse: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setRows((await listPayments(token)).items); setError(""); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Payments could not be loaded."); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  async function reverse(event: FormEvent) { event.preventDefault(); try { await reversePayment(token, selectedId, reason); setSelectedId(""); setReason(""); await load(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The payment could not be reversed."); } }
  return <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Payment history</h2><p className="text-sm text-muted-foreground">Posted payments and compensating reversals are retained permanently.</p>{error && <p className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-5 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Payment</th><th>Receipt</th><th>Method</th><th>Status</th><th>Date</th><th className="pr-4 text-right">Amount</th></tr></thead><tbody>{rows.map(({ payment, receiptNumber }) => <tr className="border-t" key={payment.id}><td className="px-4 py-3 font-medium">{payment.paymentNumber}</td><td>{receiptNumber ?? "—"}</td><td>{payment.method}</td><td>{payment.status}</td><td>{new Date(payment.paidAt).toLocaleString("en-PH")}</td><td className="pr-4 text-right"><span className="tabular-nums">{peso(payment.amountCentavos)}</span>{canReverse && payment.status === "POSTED" && <Button className="ml-3" onClick={() => setSelectedId(payment.id)} size="sm" variant="outline">Reverse</Button>}</td></tr>)}</tbody></table></div>{selectedId && <form className="mt-5 rounded-lg border border-danger/30 bg-danger/5 p-4" onSubmit={reverse}><p className="font-medium">Reverse posted payment</p><p className="text-sm text-muted-foreground">This creates a compensating ledger debit and voids the receipt. The original payment remains visible.</p><Input className="mt-3" minLength={10} placeholder="Reason (at least 10 characters)" required value={reason} onChange={(event) => setReason(event.target.value)} /><div className="mt-3 flex gap-2"><Button type="submit" variant="destructive">Confirm reversal</Button><Button onClick={() => setSelectedId("")} type="button" variant="outline">Cancel</Button></div></form>}</section>;
}

function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
