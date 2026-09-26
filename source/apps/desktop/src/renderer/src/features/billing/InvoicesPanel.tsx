import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, listInvoices, type InvoiceListItem } from "@/lib/api-client";

export function InvoicesPanel({ token }: { token: string }) {
  const [periodKey, setPeriodKey] = useState("");
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setInvoices((await listInvoices(token, periodKey)).items); setError(""); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Invoices could not be loaded."); } }, [periodKey, token]);
  useEffect(() => { void load(); }, [load]);
  return <section className="rounded-xl border bg-surface p-6"><div><h2 className="text-lg font-semibold">Invoices</h2><p className="text-sm text-muted-foreground">Finalized monthly charges. Posted records are read-only.</p></div><div className="mt-5 flex max-w-md gap-2"><Input aria-label="Filter billing month" type="month" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} /><Button onClick={() => void load()} variant="outline">Refresh</Button></div>{error && <p className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-5 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Invoice</th><th>Date</th><th>Due</th><th>Plan</th><th>Status</th><th className="pr-4 text-right">Total</th></tr></thead><tbody>{invoices.map((invoice) => <tr className="border-t" key={invoice.id}><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td>{invoice.invoiceDate}</td><td>{invoice.dueDate}</td><td>{invoice.planNameSnapshot}</td><td>{invoice.status}</td><td className="pr-4 text-right tabular-nums">{peso(invoice.totalCentavos)}</td></tr>)}{invoices.length === 0 && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>No invoices match this period.</td></tr>}</tbody></table></div></section>;
}

function peso(value: string) { const centavos = BigInt(value); return `₱${(centavos / 100n).toLocaleString("en-PH")}.${(centavos % 100n).toString().padStart(2, "0")}`; }
