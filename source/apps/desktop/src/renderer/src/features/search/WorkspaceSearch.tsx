import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listInvoices, listPayments, listSubscribers } from "@/lib/api-client";

export type SearchTarget = { kind: "subscriber" | "invoice" | "payment"; id: string };
type SearchHit = SearchTarget & { title: string; detail: string };

export function WorkspaceSearch({ token, permissions, onOpen }: { token: string; permissions: readonly string[]; onOpen: (target: SearchTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const canSearchSubscribers = permissions.includes("subscriber.view");
  const canSearchBilling = permissions.includes("billing.view");

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);
  useEffect(() => { sequence.current += 1; setHits([]); setMessage(""); setOpen(false); }, [token]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2 || value.length > 100) { setHits([]); setMessage("Enter 2–100 characters."); return; }
    const requestNumber = ++sequence.current;
    setBusy(true);
    setMessage("");
    const tasks: Array<Promise<SearchHit[]>> = [];
    if (canSearchSubscribers) tasks.push(listSubscribers(token, value).then((page) => page.items.slice(0, 10).map((item) => ({ kind: "subscriber" as const, id: item.id, title: item.accountNumber, detail: `${item.firstName} ${item.lastName}` }))));
    if (canSearchBilling && /^[A-Za-z0-9-]{2,40}$/.test(value)) {
      tasks.push(listInvoices(token, "", 1, value).then((page) => page.items.slice(0, 10).map((item) => ({ kind: "invoice" as const, id: item.id, title: item.invoiceNumber, detail: `${item.subscriberAccountNumber} · ${item.subscriberName}` }))));
      tasks.push(listPayments(token, 1, undefined, value).then((page) => page.items.slice(0, 10).map((item) => ({ kind: "payment" as const, id: item.payment.id, title: item.receiptNumber ?? item.payment.paymentNumber, detail: `${item.payment.paymentNumber} · ${item.payment.status}` }))));
    }
    if (tasks.length === 0) { setBusy(false); setHits([]); setMessage("No permitted record category can be searched with this value."); return; }
    const settled = await Promise.allSettled(tasks);
    if (requestNumber !== sequence.current) return;
    const found = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    setHits(found);
    setMessage(settled.every((result) => result.status === "rejected") ? "Search is unavailable. Check the API connection and try again." : settled.some((result) => result.status === "rejected") ? "Some permitted record categories could not be searched. Try again." : found.length === 0 ? "No matching permitted records." : "");
    setBusy(false);
  }

  if (!canSearchSubscribers && !canSearchBilling) return null;
  return <div className="relative" ref={container} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <Button aria-controls="workspace-search-panel" aria-expanded={open} aria-label="Search BCIS records" onClick={() => setOpen((value) => !value)} size="icon" title="Search BCIS records" variant="ghost"><Search aria-hidden="true" /></Button>
    {open && <section aria-label="Search BCIS records" className="absolute right-0 top-12 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-surface p-4 shadow-xl" id="workspace-search-panel">
      <form className="flex gap-2" onSubmit={(event) => void search(event)}><Input aria-label="Search account, name, contact, address, invoice, payment or receipt" maxLength={100} onChange={(event) => { sequence.current += 1; setQuery(event.target.value); setHits([]); setMessage(""); }} placeholder="Account, invoice, or receipt…" ref={input} value={query} /><Button disabled={busy} type="submit" variant="accent">{busy ? "Searching…" : "Search"}</Button><Button aria-label="Close search" onClick={() => setOpen(false)} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button></form>
      <p className="mt-2 text-xs text-muted-foreground">Subscriber search includes active contacts and addresses. GCash-reference lookup is unavailable pending policy approval.</p>
      {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}
      {hits.length > 0 && <div aria-label="Search results" className="mt-3 max-h-72 overflow-y-auto rounded-lg border" role="region">{hits.map((hit) => <button className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted focus-visible:bg-muted" key={`${hit.kind}:${hit.id}`} onClick={() => { setOpen(false); onOpen({ kind: hit.kind, id: hit.id }); }} type="button"><span className="font-medium">{hit.title}</span><span className="ml-2 text-xs uppercase text-muted-foreground">{hit.kind}</span><span className="block text-xs text-muted-foreground">{hit.detail}</span></button>)}</div>}
    </section>}
  </div>;
}
