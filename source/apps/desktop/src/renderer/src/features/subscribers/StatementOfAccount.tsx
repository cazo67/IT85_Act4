import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, exportReport, previewReport, type ReportDocument } from "@/lib/api-client";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function money(value: string | number) {
  const centavos = BigInt(value);
  const absolute = centavos < 0n ? -centavos : centavos;
  return `${centavos < 0n ? "-" : ""}₱${(absolute / 100n).toLocaleString("en-PH")}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function StatementOfAccount({ token, subscriberId, canExport }: { token: string; subscriberId: string; canExport: boolean }) {
  const [dateFrom, setDateFrom] = useState(() => `${localDate().slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(localDate);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReport(null);
    setMessage("");
    if (dateFrom > dateTo) { setMessage("Start date must not be after end date."); return; }
    setBusy(true);
    try { setReport(await previewReport(token, "subscriber-soa", { subscriberId, dateFrom, dateTo })); }
    catch (error) { setMessage(error instanceof ApiError || error instanceof Error ? error.message : "Statement preview failed."); }
    finally { setBusy(false); }
  }

  async function download(format: "pdf" | "xlsx") {
    if (!report) return;
    setBusy(true);
    setMessage("");
    try {
      const output = await exportReport(token, "subscriber-soa", report.parameters, format);
      const result = await window.bcis.saveReport({ suggestedName: output.filename, bytes: output.bytes });
      setMessage(result.saved ? `${output.filename} was saved.` : "Export cancelled.");
    } catch (error) { setMessage(error instanceof ApiError || error instanceof Error ? error.message : "Statement export failed."); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 min-w-0 rounded-xl border p-5">
    <h3 className="font-semibold">Statement of Account</h3>
    <p className="text-sm text-muted-foreground">Select a posting-date range. Opening and closing balances come from the server ledger.</p>
    <form className="mt-4 flex flex-wrap items-end gap-3 print:hidden" onSubmit={preview}>
      <label className="text-sm">From<Input required type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setReport(null); }} /></label>
      <label className="text-sm">To<Input required type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setReport(null); }} /></label>
      <Button disabled={busy} type="submit" variant="accent">{busy ? "Working…" : "Preview statement"}</Button>
      {report && <Button type="button" variant="outline" onClick={() => window.print()}>Print</Button>}
      {report && canExport && <><Button disabled={busy} type="button" variant="outline" onClick={() => void download("pdf")}>Save PDF</Button><Button disabled={busy} type="button" variant="outline" onClick={() => void download("xlsx")}>Save XLSX</Button></>}
    </form>
    {message && <p className="mt-3 text-sm print:hidden" role="status">{message}</p>}
    {report && <div className="print-report mt-5">
      <div className="border-b pb-3"><p className="hidden text-xs font-semibold print:block">BCIS</p><h4 className="font-semibold">{report.title}</h4><p className="text-xs text-muted-foreground">{report.parameters.dateFrom} to {report.parameters.dateTo} · Generated {new Date(report.generatedAt).toLocaleString()}</p></div>
      <div className="mt-4 overflow-x-auto rounded-lg border print:overflow-visible"><table className="w-full min-w-[620px] text-left text-sm print:min-w-0"><thead className="bg-muted"><tr>{report.columns.map((column) => <th className="px-3 py-2" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr className="border-t" key={index}>{report.columns.map((column) => <td className={`px-3 py-2 ${column.type === "money" ? "text-right tabular-nums" : ""}`} key={column.key}>{column.type === "money" ? money(row[column.key] ?? "0") : String(row[column.key] ?? "")}</td>)}</tr>)}{report.rows.length === 0 && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={report.columns.length}>No ledger activity in this range.</td></tr>}</tbody></table></div>
      <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm">{report.summary.map((item) => <p key={item.label}>{item.label}: <strong>{item.type === "money" ? money(item.value) : String(item.value)}</strong></p>)}</div>
    </div>}
  </section>;
}
