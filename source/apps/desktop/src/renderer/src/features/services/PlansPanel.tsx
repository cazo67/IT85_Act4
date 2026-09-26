import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createPlan, listPlans, listServiceTypes, setPlanActive, type ServicePlan } from "@/lib/api-client";

export function PlansPanel({ token, canManage }: { token: string; canManage: boolean }) {
  const [plans, setPlans] = useState<Array<{ plan: ServicePlan; serviceTypeName: string }>>([]);
  const [types, setTypes] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => { try { const [p, t] = await Promise.all([listPlans(token, true), listServiceTypes(token)]); setPlans(p); setTypes(t); setError(""); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Plans could not be loaded."); } }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function togglePlan(plan: ServicePlan) {
    try { await setPlanActive(token, plan.id, !plan.isActive); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "The plan status could not be changed."); }
  }

  return <section className="rounded-xl border bg-surface p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Service plans</h2><p className="text-sm text-muted-foreground">Internet, Cable, and Combo rates used for future services</p></div>{canManage && <Button onClick={() => setShowForm(!showForm)} variant="accent">New plan</Button>}</div>{error && <p className="mt-4 text-danger">{error}</p>}{showForm && <PlanForm token={token} types={types} onCreated={async () => { setShowForm(false); await load(); }} />}<div className="mt-5 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Code</th><th>Plan</th><th>Type</th><th className="text-right">Monthly rate</th><th className="pr-4 text-right">Status</th></tr></thead><tbody>{plans.map(({ plan, serviceTypeName }) => <tr className="border-t" key={plan.id}><td className="px-4 py-3 font-medium">{plan.code}</td><td>{plan.name}</td><td>{serviceTypeName}</td><td className="text-right tabular-nums">{peso(plan.priceCentavos)}</td><td className="pr-4 text-right">{canManage ? <Button onClick={() => void togglePlan(plan)} size="sm" variant="outline">{plan.isActive ? "Deactivate" : "Activate"}</Button> : plan.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div></section>;
}

function PlanForm({ token, types, onCreated }: { token: string; types: Array<{ id: string; code: string; name: string }>; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ code: "", name: "", typeId: types[0]?.id ?? "", typeCode: types[0]?.code ?? "", price: "", speed: "", channels: "" });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); try { await createPlan(token, { code: form.code, serviceTypeId: form.typeId, name: form.name, description: "", priceCentavos: pesosToCentavos(form.price), installationFeeCentavos: "0", reconnectionFeeCentavos: "0", internetSpeedMbps: form.speed ? Number(form.speed) : undefined, cableChannelCount: form.channels ? Number(form.channels) : undefined }); await onCreated(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The plan could not be created."); } }
  return <form className="mt-5 rounded-lg border bg-muted/30 p-4" onSubmit={submit}><div className="grid gap-3 md:grid-cols-3"><Field label="Code"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field><Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Service type"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.typeId} onChange={(e) => { const type = types.find((candidate) => candidate.id === e.target.value); setForm({ ...form, typeId: e.target.value, typeCode: type?.code ?? "" }); }}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field><Field label="Monthly price (PHP)"><Input required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>{(form.typeCode === "INTERNET" || form.typeCode === "COMBO") && <Field label="Speed Mbps"><Input required type="number" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} /></Field>}{(form.typeCode === "CABLE" || form.typeCode === "COMBO") && <Field label="Channel count"><Input required type="number" value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} /></Field>}</div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<Button className="mt-4" type="submit" variant="accent">Create plan</Button></form>;
}

function pesosToCentavos(value: string) { const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!match) throw new Error("Enter a valid peso amount."); return (BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString(); }
function peso(value: string) { const centavos = BigInt(value); const whole = centavos / 100n; const fraction = (centavos % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-PH")}.${fraction}`; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
