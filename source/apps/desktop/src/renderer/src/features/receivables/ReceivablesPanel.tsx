import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, actOnServiceControl, listServiceControl, listSuspensionCandidates, requestReconnection, requestSuspension, type ServiceControlList, type SuspensionCandidate } from "@/lib/api-client";
import { ReceivableOverview } from "./ReceivableOverview";

const today = new Date().toISOString().slice(0, 10);

export function ReceivablesPanel({ token, canSuspend, canReconnect }: { token: string; canSuspend: boolean; canReconnect: boolean }) {
  const [asOf, setAsOf] = useState(today);
  const [candidates, setCandidates] = useState<SuspensionCandidate[]>([]);
  const [controls, setControls] = useState<ServiceControlList>({ suspensions: [], reconnections: [] });
  const [minimumDays, setMinimumDays] = useState("30");
  const [minimumPesos, setMinimumPesos] = useState("0");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const minimum = pesosToCentavos(minimumPesos, true);
      const [candidateData, controlData] = await Promise.all([listSuspensionCandidates(token, asOf, Number(minimumDays), minimum), listServiceControl(token)]);
      setCandidates(candidateData); setControls(controlData); setError("");
    } catch (caught) { setError(message(caught)); }
  }, [asOf, minimumDays, minimumPesos, token]);
  useEffect(() => { void load(); }, [load]);
  async function suspend(candidate: SuspensionCandidate) {
    const reason = window.prompt("Reason for the suspension request (at least 10 characters):", `Overdue account review as of ${asOf}.`);
    if (!reason) return;
    try { await requestSuspension(token, { serviceAccountId: candidate.serviceAccountId, asOf, reason }); await load(); } catch (caught) { setError(message(caught)); }
  }
  async function reconnect(serviceAccountId: string) {
    const reason = window.prompt("Reason for the reconnection request (at least 10 characters):", "Subscriber requested reconnection after account review.");
    if (!reason) return;
    try { await requestReconnection(token, { serviceAccountId, reason }); await load(); } catch (caught) { setError(message(caught)); }
  }
  async function act(kind: "suspensions" | "reconnections", id: string, action: "approve" | "complete", version: number) {
    try { await actOnServiceControl(token, kind, id, action, version, action === "approve" ? "Reviewed and approved." : ""); await load(); } catch (caught) { setError(message(caught)); }
  }
  return <div className="space-y-6">
    <ReceivableOverview token={token} asOf={asOf} onAsOfChange={setAsOf} />
    {error && <p className="rounded-lg border border-danger/30 p-3 text-sm text-danger" role="alert">{error}</p>}
    <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Suspension candidate review</h2><p className="text-sm text-muted-foreground">These are review filters, not approved automatic suspension policy.</p><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(); }}><label className="text-sm">Minimum overdue days<Input inputMode="numeric" value={minimumDays} onChange={(event) => setMinimumDays(event.target.value)} /></label><label className="text-sm">Minimum balance (PHP)<Input inputMode="decimal" value={minimumPesos} onChange={(event) => setMinimumPesos(event.target.value)} /></label><Button type="submit" variant="outline">Apply review filters</Button></form><div className="mt-4 overflow-auto rounded-lg border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Subscriber</th><th>Service</th><th>Oldest due</th><th>Days</th><th className="text-right">Overdue</th><th className="pr-4"></th></tr></thead><tbody>{candidates.map((row) => <tr className="border-t" key={row.serviceAccountId}><td className="px-4 py-3">{row.accountNumber} · {row.subscriberName}</td><td>{row.serviceAccountNumber}</td><td>{row.oldestDueDate}</td><td>{row.maximumDaysPastDue}</td><td className="text-right">{peso(row.overdueCentavos)}</td><td className="pr-4 text-right">{canSuspend && <Button size="sm" onClick={() => void suspend(row)} variant="outline">Request suspension</Button>}</td></tr>)}</tbody></table></div></section>
    <ControlTable title="Suspensions" kind="suspensions" rows={controls.suspensions} canAct={canSuspend} onAct={act} onReconnect={canReconnect ? reconnect : undefined} />
    <ControlTable title="Reconnections" kind="reconnections" rows={controls.reconnections} canAct={canReconnect} onAct={act} />
    <p className="text-xs text-muted-foreground">Approval must be performed by someone other than the requester; completion must be performed by someone other than the approver. Automatic qualification and reconnection fees remain disabled until policy is approved.</p>
  </div>;
}

function ControlTable({ title, kind, rows, canAct, onAct, onReconnect }: { title: string; kind: "suspensions" | "reconnections"; rows: ServiceControlList["suspensions"]; canAct: boolean; onAct: (kind: "suspensions" | "reconnections", id: string, action: "approve" | "complete", version: number) => Promise<void>; onReconnect?: ((serviceAccountId: string) => Promise<void>) | undefined }) {
  return <section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 overflow-auto rounded-lg border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Subscriber</th><th>Service</th><th>Reason</th><th>Status</th><th className="pr-4"></th></tr></thead><tbody>{rows.map(({ record, accountNumber, subscriberName, serviceAccountNumber }) => <tr className="border-t" key={record.id}><td className="px-4 py-3">{accountNumber} · {subscriberName}</td><td>{serviceAccountNumber}</td><td>{record.reason}</td><td>{record.status}</td><td className="pr-4 text-right"><div className="flex justify-end gap-2">{canAct && record.status === "REQUESTED" && <Button size="sm" variant="outline" onClick={() => void onAct(kind, record.id, "approve", record.version)}>Approve</Button>}{canAct && record.status === "APPROVED" && <Button size="sm" variant="accent" onClick={() => void onAct(kind, record.id, "complete", record.version)}>Complete</Button>}{onReconnect && record.status === "COMPLETED" && <Button size="sm" variant="outline" onClick={() => void onReconnect(record.serviceAccountId)}>Request reconnection</Button>}</div></td></tr>)}{rows.length === 0 && <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>No {title.toLowerCase()} yet.</td></tr>}</tbody></table></div></section>;
}

function pesosToCentavos(value: string, allowZero = false) { const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!match) throw new Error("Enter a valid peso amount."); const result = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0"); if (!allowZero && result <= 0n) throw new Error("Amount must be greater than zero."); return result.toString(); }
function peso(value: string) { const amount = BigInt(value); return `₱${(amount / 100n).toLocaleString("en-PH")}.${(amount % 100n).toString().padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : "The request could not be completed."; }
