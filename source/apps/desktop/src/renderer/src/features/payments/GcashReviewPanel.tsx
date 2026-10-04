import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getGcashProof, getGcashProofImage, listGcashProofs, rejectGcashProof, verifyGcashProof, type GcashProof, type PaymentResult } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function GcashReviewPanel({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GcashProof["status"]>("PENDING");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [historyConfirmed, setHistoryConfirmed] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<PaymentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const list = useQuery({ queryKey: queryKeys.gcashProofs.list(status, page), queryFn: () => listGcashProofs(token, status, page) });
  const detail = useQuery({ queryKey: queryKeys.gcashProofs.detail(selectedId), queryFn: () => getGcashProof(token, selectedId), enabled: Boolean(selectedId) });

  useEffect(() => {
    if (!selectedId) { setImageUrl(null); setImageError(""); return; }
    let active = true;
    const reader = new FileReader();
    setImageUrl(null);
    setImageError("");
    void getGcashProofImage(token, selectedId).then((blob) => {
      if (!active) return;
      reader.onload = () => { if (active && typeof reader.result === "string") setImageUrl(reader.result); };
      reader.onerror = () => { if (active) setImageError("The proof image could not be displayed."); };
      reader.readAsDataURL(blob);
    }).catch((error: unknown) => { if (active) setImageError(message(error)); });
    return () => { active = false; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [token, selectedId]);

  async function confirmReject() {
    if (!selectedId) return;
    setBusy(true);
    setActionError("");
    try {
      await rejectGcashProof(token, selectedId, reason.trim());
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["gcash-proofs"] }), queryClient.invalidateQueries({ queryKey: ["my-gcash-proofs"] })]);
      setConfirmOpen(false);
      setReason("");
      setStatus("REJECTED");
      setPage(1);
    } catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  }

  async function confirmVerify() {
    if (!selectedId || !historyConfirmed || !imageUrl) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await verifyGcashProof(token, selectedId);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["gcash-proofs"] }), queryClient.invalidateQueries({ queryKey: ["my-gcash-proofs"] })]);
      setVerifiedResult(result);
      setVerifyOpen(false);
      setHistoryConfirmed(false);
      setStatus("VERIFIED");
      setPage(1);
    } catch (error) { setActionError(`${message(error)} If the response was lost, check payment history or retry verification of this same proof; it will not create a second payment.`); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-surface p-5 md:p-6">
      <h2 className="text-lg font-semibold">GCash proof review</h2>
      <p className="mt-1 text-sm text-muted-foreground">A submitted proof is not a payment. Verification must match the receiver's actual GCash transaction history; a screenshot alone is insufficient.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">Status<select aria-label="GCash proof status" className="block h-10 min-w-40 rounded-md border border-input bg-background px-3" onChange={(event) => { setStatus(event.target.value as GcashProof["status"]); setPage(1); setSelectedId(""); }} value={status}><option value="PENDING">Pending</option><option value="REJECTED">Rejected</option><option value="VERIFIED">Verified</option></select></label>
        <Button disabled={list.isFetching} onClick={() => void list.refetch()} variant="outline">Refresh</Button>
      </div>
      {list.isPending && <div className="mt-5"><LoadingState label="Loading GCash proofs…" /></div>}
      {list.isError && <div className="mt-5"><ErrorState message={message(list.error)} onRetry={() => void list.refetch()} /></div>}
      {list.data && (list.data.items.length === 0 ? <EmptyState title="No proofs in this status" detail="Submitted proofs will appear here after staff upload them." /> : <div className="mt-5 overflow-x-auto rounded-lg border"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2">Reference</th><th>Sender</th><th>Amount</th><th>Status</th><th>Submitted</th><th className="pr-3 text-right">Action</th></tr></thead><tbody>{list.data.items.map((proof) => <tr className="border-t" key={proof.id}><td className="px-3 py-2 font-medium">{proof.normalizedExternalReference}</td><td>{proof.senderName}</td><td>{peso(proof.amountCentavos)}</td><td>{proof.status}</td><td>{new Date(proof.createdAt).toLocaleString("en-PH")}</td><td className="pr-3 text-right"><Button aria-label={`Review GCash proof ${proof.normalizedExternalReference}`} onClick={() => { setSelectedId(proof.id); setHistoryConfirmed(false); setVerifiedResult(null); setActionError(""); }} size="sm" variant="outline">Review</Button></td></tr>)}</tbody></table></div>)}
      {list.data && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button disabled={page === 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><span>Page {page}</span><Button disabled={!list.data.hasMore} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div>}
    </section>
    {selectedId && <section className="rounded-xl border bg-surface p-5 md:p-6"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Proof detail</h2><Button onClick={() => setSelectedId("")} variant="outline">Close</Button></div>
      {detail.isPending && <div className="mt-4"><LoadingState label="Loading proof details…" /></div>}
      {detail.isError && <div className="mt-4"><ErrorState message={message(detail.error)} onRetry={() => void detail.refetch()} /></div>}
      {detail.data && <div className="mt-4 grid gap-5 lg:grid-cols-2"><dl className="space-y-2 text-sm"><Fact label="Reference" value={detail.data.normalizedExternalReference} /><Fact label="Subscriber ID" value={detail.data.subscriberId} /><Fact label="Sender" value={detail.data.senderName} /><Fact label="Mobile" value={detail.data.senderMobile} /><Fact label="Amount claimed" value={peso(detail.data.amountCentavos)} /><Fact label="Status" value={detail.data.status} /><Fact label="Submitted" value={new Date(detail.data.createdAt).toLocaleString("en-PH")} />{detail.data.reviewReason && <Fact label="Rejection reason" value={detail.data.reviewReason} />}</dl><div className="rounded-lg border bg-muted/20 p-3"><p className="mb-2 text-sm font-medium">Submitted proof image</p>{imageUrl ? <img alt={`GCash proof for reference ${detail.data.normalizedExternalReference}`} className="max-h-80 w-full rounded object-contain" src={imageUrl} /> : imageError ? <p className="text-sm text-danger" role="alert">{imageError}</p> : <p className="text-sm text-muted-foreground" role="status">Loading image…</p>}</div></div>}
      {detail.data?.status === "PENDING" && <div className="mt-5 max-w-xl space-y-4"><div className="rounded-lg border p-4"><p className="text-sm font-medium">Receiver-history verification</p><p className="mt-1 text-sm text-muted-foreground">Compare this proof's reference, sender, mobile and amount with the company's received GCash transaction. Do not post from the screenshot alone.</p><label className="mt-3 flex items-start gap-2 text-sm"><input aria-label="Receiver GCash history confirmed" checked={historyConfirmed} className="mt-1" onChange={(event) => setHistoryConfirmed(event.target.checked)} type="checkbox" /><span>I checked the receiver's GCash history and confirmed the reference, sender and amount match.</span></label><Button className="mt-3" disabled={!historyConfirmed || !imageUrl || busy} onClick={() => setVerifyOpen(true)} variant="accent">Review verification and posting</Button></div><div><p className="text-sm text-muted-foreground">If the receiver's transaction history does not confirm the details, enter a reason and reject this proof. This does not post or reverse any payment.</p><label className="mt-2 block text-sm">Rejection reason<Input aria-label="GCash rejection reason" maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} /></label><Button className="mt-2" disabled={reason.trim().length < 10 || busy} onClick={() => setConfirmOpen(true)} variant="destructive">Review rejection</Button></div></div>}
      {verifiedResult?.receipt && <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm" role="status">GCash payment {verifiedResult.payment.paymentNumber} posted. Receipt {verifiedResult.receipt.receiptNumber} is available in Payment history. Amount: {peso(verifiedResult.payment.amountCentavos)}.</p>}
      {actionError && <p className="mt-4 text-sm text-danger" role="alert">{actionError}</p>}
    </section>}
    <ConfirmationDialog busy={busy} confirmLabel="Reject proof" description="Keep the proof and audit history, mark this submission rejected, and post no payment." destructive onCancel={() => setConfirmOpen(false)} onConfirm={() => void confirmReject()} open={confirmOpen} title="Confirm GCash proof rejection?" />
    <ConfirmationDialog busy={busy} confirmLabel="Verify and post GCash payment" description="You confirmed this transaction in the receiver's GCash history. BCIS will post one payment, allocate oldest invoices first, retain any credit and issue one receipt. This cannot be undone by editing the proof; correction requires a reasoned reversal." details={detail.data && <div>Reference: <strong>{detail.data.normalizedExternalReference}</strong><br />Sender: {detail.data.senderName} ({detail.data.senderMobile})<br />Amount: {peso(detail.data.amountCentavos)}</div>} onCancel={() => setVerifyOpen(false)} onConfirm={() => void confirmVerify()} open={verifyOpen} title="Confirm verified GCash payment?" />
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>; }
function peso(value: string) { const cents = BigInt(value); return `₱${(cents / 100n).toLocaleString("en-PH")}.${(cents % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
