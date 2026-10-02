import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, getLedger, type LedgerPage } from "@/lib/api-client";

export function SubscriberLedger({ token, subscriberId }: { token: string; subscriberId: string }) {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LedgerPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setResult(await getLedger(token, subscriberId, page, range?.from, range?.to)); setError(""); }
    catch (caught) { setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "Ledger could not be loaded."); }
    finally { setLoading(false); }
  }, [page, range, subscriberId, token]);
  useEffect(() => { void load(); }, [load]);

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromInput || !toInput || fromInput > toInput) { setError("Select both dates, with From not after To."); return; }
    setPage(1);
    setRange({ from: fromInput, to: toInput });
  }

  return <section className="mt-6 min-w-0 rounded-xl border p-5">
    <h3 className="font-semibold">Subscriber ledger</h3>
    <p className="text-sm text-muted-foreground">Chronological debit and credit history. Balances are calculated by the server.</p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={applyRange}>
      <label className="text-sm">From<Input aria-label="Ledger from date" type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} /></label>
      <label className="text-sm">To<Input aria-label="Ledger to date" type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} /></label>
      <Button disabled={loading} type="submit" variant="outline">Apply dates</Button>
      {range && <Button disabled={loading} onClick={() => { setRange(null); setFromInput(""); setToInput(""); setPage(1); }} type="button" variant="outline">Show all dates</Button>}
    </form>
    {error && <p className="mt-3 text-sm text-danger" role="alert">{error} <Button onClick={() => void load()} size="sm" variant="outline">Retry</Button></p>}
    {loading && <p className="mt-3 text-sm text-muted-foreground">Loading ledger…</p>}
    {result && <>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm"><p>Opening balance: <strong className="tabular-nums">{peso(result.openingBalanceCentavos)}</strong></p><p>Balance before this page: <strong className="tabular-nums">{peso(result.pageOpeningBalanceCentavos)}</strong></p><p>Closing balance: <strong className="tabular-nums">{peso(result.closingBalanceCentavos)}</strong></p></div>
      <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2">Posting time</th><th>Sequence</th><th>Type / reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="pr-3 text-right">Running balance</th></tr></thead><tbody>{result.entries.map((entry) => <tr className="border-t" key={entry.id}><td className="px-3 py-2 whitespace-nowrap">{new Date(entry.occurredAt).toLocaleString("en-PH")}</td><td>{entry.sequenceNumber}</td><td><span className="block font-medium">{entry.type.replaceAll("_", " ")}</span><span className="text-muted-foreground">{entry.description}</span></td><td className="text-right tabular-nums">{entry.debitCentavos === "0" ? "—" : peso(entry.debitCentavos)}</td><td className="text-right tabular-nums">{entry.creditCentavos === "0" ? "—" : peso(entry.creditCentavos)}</td><td className="pr-3 text-right tabular-nums">{peso(entry.balanceCentavos)}</td></tr>)}{!loading && result.entries.length === 0 && <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>No ledger entries for these dates.</td></tr>}</tbody></table></div>
      <div className="mt-3 flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {result.page}</p><div className="flex gap-2"><Button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button><Button disabled={!result.hasMore || loading} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div></div>
    </>}
  </section>;
}

function peso(value: string) { const centavos = BigInt(value); const absolute = centavos < 0n ? -centavos : centavos; return `${centavos < 0n ? "-" : ""}₱${(absolute / 100n).toLocaleString("en-PH")}.${String(absolute % 100n).padStart(2, "0")}`; }
