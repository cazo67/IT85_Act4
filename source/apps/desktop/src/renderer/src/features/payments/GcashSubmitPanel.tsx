import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listMyGcashProofs, listSubscribers, resubmitGcashProof, submitGcashProof, type GcashProof, type SubscriberListItem } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const formSchema = z.object({
  amountPesos: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Enter a valid amount in PHP.").refine((value) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && BigInt(value.replace(".", "")) > 0n, "Amount must be greater than zero."),
  senderName: z.string().trim().min(2).max(100),
  senderMobile: z.string().regex(/^09\d{9}$/, "Enter an 11-digit mobile number beginning with 09."),
  reference: z.string().trim().min(6).max(80).refine((value) => /^[A-Z0-9]{6,40}$/.test(value.trim().toUpperCase().replace(/[ -]/g, "")), "Use 6-40 letters or digits; only spaces and hyphens are ignored.")
});
type FormValues = z.infer<typeof formSchema>;

export function GcashSubmitPanel({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [correction, setCorrection] = useState<GcashProof | null>(null);
  const [notice, setNotice] = useState("");
  const mine = useQuery({ queryKey: queryKeys.gcashProofs.mine(page), queryFn: () => listMyGcashProofs(token, page) });

  async function saved(reference: string) {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["my-gcash-proofs"] }), queryClient.invalidateQueries({ queryKey: ["gcash-proofs"] })]);
    setNotice(`Proof ${reference} is pending review. No payment was posted.`);
    setCorrection(null);
    setPage(1);
  }

  return <div className="space-y-5">
    {notice && <p className="rounded-lg border bg-surface p-3 text-sm" role="status">{notice}</p>}
    <ProofForm key={correction?.id ?? "new"} token={token} correction={correction} onCancel={() => setCorrection(null)} onSaved={(reference) => void saved(reference)} />
    <section className="rounded-xl border bg-surface p-5 md:p-6"><h2 className="text-lg font-semibold">My GCash submissions</h2><p className="mt-1 text-sm text-muted-foreground">Pending proof is not a posted payment. Correct only a rejected submission; its reference stays reserved.</p>
      {mine.isPending && <div className="mt-4"><LoadingState label="Loading submissions..." /></div>}
      {mine.isError && <div className="mt-4"><ErrorState message={message(mine.error)} onRetry={() => void mine.refetch()} /></div>}
      {mine.data && (mine.data.items.length ? <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2">Reference</th><th>Amount</th><th>Status</th><th>Reason</th><th className="pr-3 text-right">Action</th></tr></thead><tbody>{mine.data.items.map((proof) => <tr className="border-t" key={proof.id}><td className="px-3 py-2 font-medium">{proof.normalizedExternalReference}</td><td>{money(proof.amountCentavos)}</td><td>{proof.status}</td><td className="max-w-64 break-words">{proof.reviewReason ?? "-"}</td><td className="pr-3 text-right">{proof.status === "REJECTED" && <Button aria-label={`Correct GCash proof ${proof.normalizedExternalReference}`} onClick={() => setCorrection(proof)} size="sm" variant="outline">Correct</Button>}</td></tr>)}</tbody></table></div> : <EmptyState title="No submissions yet" detail="Upload a synthetic or authorized proof above." />)}
      {mine.data && <div className="mt-4 flex justify-end gap-2"><Button disabled={page === 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><span className="self-center text-sm">Page {page}</span><Button disabled={!mine.data.hasMore} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div>}
    </section>
  </div>;
}

function ProofForm({ token, correction, onCancel, onSaved }: { token: string; correction: GcashProof | null; onCancel: () => void; onSaved: (reference: string) => void }) {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<SubscriberListItem[]>([]);
  const [selected, setSelected] = useState<SubscriberListItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { amountPesos: correction ? centavosToPesos(correction.amountCentavos) : "", senderName: correction?.senderName ?? "", senderMobile: correction?.senderMobile ?? "", reference: correction?.normalizedExternalReference ?? "" } });

  async function searchSubscriber(event: FormEvent) {
    event.preventDefault();
    try { setMatches((await listSubscribers(token, search.trim())).items); setError(""); }
    catch (caught) { setError(message(caught)); }
  }

  async function save(values: FormValues) {
    const subscriberId = correction?.subscriberId ?? selected?.id;
    if (!subscriberId) { setError("Select a subscriber before uploading a proof."); return; }
    if (!file) { setError("Select a JPEG or PNG proof image."); return; }
    if (file.size === 0 || file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type) || !/\.(png|jpe?g)$/i.test(file.name)) { setError("Choose a JPEG or PNG image no larger than 2 MiB, with a matching file name."); return; }
    setError("");
    try {
      const imageBase64 = await fileAsBase64(file);
      const details = { amountCentavos: pesosToCentavos(values.amountPesos), senderName: values.senderName.trim(), senderMobile: values.senderMobile, originalFileName: file.name, imageBase64 };
      const proof = correction ? await resubmitGcashProof(token, correction.id, details) : await submitGcashProof(token, { ...details, subscriberId, externalReference: values.reference.trim() });
      setFile(null);
      setFileInputKey((value) => value + 1);
      form.reset();
      setSelected(null);
      setMatches([]);
      onSaved(proof.normalizedExternalReference);
    } catch (caught) { setError(`${message(caught)} If the response was lost, check My GCash submissions before retrying; duplicate references are blocked.`); }
  }

  return <section className="rounded-xl border bg-surface p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{correction ? "Correct rejected GCash proof" : "Submit GCash proof"}</h2><p className="mt-1 text-sm text-muted-foreground">Upload records a pending claim only. A verifier must confirm the receiver transaction before BCIS posts a payment.</p></div>{correction && <Button onClick={onCancel} variant="outline">Cancel correction</Button>}</div>
    {correction ? <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">Original reference: <strong>{correction.normalizedExternalReference}</strong><br />Subscriber ID: {correction.subscriberId}. This correction retains the same reference and audit history.</p> : <form className="mt-4" onSubmit={searchSubscriber}><label className="block text-sm">Find subscriber<Input aria-label="Find GCash subscriber" className="mt-1" onChange={(event) => setSearch(event.target.value)} placeholder="Account number or name" value={search} /></label><Button className="mt-2" type="submit" variant="outline">Search subscriber</Button>{matches.length > 0 && <div className="mt-2 max-h-40 overflow-auto rounded-lg border">{matches.map((item) => <button className={`block w-full border-b px-3 py-2 text-left text-sm last:border-0 ${selected?.id === item.id ? "bg-accent/10" : "hover:bg-muted"}`} key={item.id} onClick={() => setSelected(item)} type="button">{item.accountNumber} - {item.firstName} {item.lastName}</button>)}</div>}{selected && <p className="mt-2 text-sm">Selected: <strong>{selected.accountNumber} - {selected.firstName} {selected.lastName}</strong></p>}</form>}
    <form className="mt-5 grid gap-4 md:grid-cols-2" noValidate onSubmit={form.handleSubmit(save)}><Field label="Amount (PHP)" error={form.formState.errors.amountPesos?.message}><Input aria-label="GCash amount in PHP" inputMode="decimal" {...form.register("amountPesos")} /></Field><Field label="Sender name" error={form.formState.errors.senderName?.message}><Input aria-label="GCash sender name" {...form.register("senderName")} /></Field><Field label="Sender mobile" error={form.formState.errors.senderMobile?.message}><Input aria-label="GCash sender mobile" inputMode="tel" {...form.register("senderMobile")} /></Field><Field label="Reference" error={form.formState.errors.reference?.message}><Input aria-label="GCash reference" readOnly={Boolean(correction)} {...form.register("reference")} /></Field><Field label="Proof image (JPEG/PNG, max 2 MiB)"><Input accept="image/png,image/jpeg" aria-label="GCash proof image" key={fileInputKey} onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></Field><div className="flex items-end"><Button disabled={form.formState.isSubmitting} type="submit" variant="accent">{form.formState.isSubmitting ? "Saving..." : correction ? "Resubmit corrected proof" : "Submit proof for review"}</Button></div></form>
    {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
  </section>;
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) { return <label className="block text-sm">{label}<div className="mt-1">{children}</div>{error && <span className="text-danger">{error}</span>}</label>; }
function pesosToCentavos(value: string) { const [whole, fraction = ""] = value.split("."); return (BigInt(whole ?? "0") * 100n + BigInt(fraction.padEnd(2, "0") || "0")).toString(); }
function centavosToPesos(value: string) { const cents = BigInt(value); return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`; }
function money(value: string) { return `PHP ${centavosToPesos(value)}`; }
function fileAsBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const result = reader.result; if (typeof result !== "string" || !result.includes(",")) reject(new Error("The proof file could not be read.")); else resolve(result.slice(result.indexOf(",") + 1)); }; reader.onerror = () => reject(new Error("The proof file could not be read.")); reader.readAsDataURL(file); }); }
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
