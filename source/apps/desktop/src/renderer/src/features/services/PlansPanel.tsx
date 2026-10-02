import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createPlan, listPlans, listServiceTypes, setPlanActive, updatePlan, type ServicePlan } from "@/lib/api-client";

export function PlansPanel({ token, canManage }: { token: string; canManage: boolean }) {
  const [plans, setPlans] = useState<Array<{ plan: ServicePlan; serviceTypeName: string }>>([]);
  const [types, setTypes] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);
  const [statusPlan, setStatusPlan] = useState<ServicePlan | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const load = useCallback(async () => { try { const [p, t] = await Promise.all([listPlans(token, true), listServiceTypes(token)]); setPlans(p); setTypes(t); setError(""); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Plans could not be loaded."); } }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function togglePlan() {
    if (!statusPlan) return;
    setStatusBusy(true);
    try { await setPlanActive(token, statusPlan.id, !statusPlan.isActive, statusPlan.version); setStatusPlan(null); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "The plan status could not be changed."); }
    finally { setStatusBusy(false); }
  }

  return <section className="rounded-xl border bg-surface p-6">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Service plans</h2><p className="text-sm text-muted-foreground">Internet, Cable, and Combo rates used for future billing</p></div>{canManage && <Button onClick={() => { setShowForm(!showForm); setEditingPlan(null); }} variant="accent">New plan</Button>}</div>
    {error && <p className="mt-4 text-danger" role="alert">{error}</p>}
    {showForm && <PlanForm token={token} types={types} onCreated={async () => { setShowForm(false); await load(); }} />}
    {editingPlan && <EditPlanForm key={editingPlan.id} token={token} plan={editingPlan} onSaved={async () => { setEditingPlan(null); await load(); }} onCancel={() => setEditingPlan(null)} />}
    <div className="mt-5 overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Code</th><th>Plan</th><th>Type</th><th className="text-right">Monthly rate</th><th className="text-right">Status</th>{canManage && <th className="pr-4 text-right">Actions</th>}</tr></thead><tbody>{plans.map(({ plan, serviceTypeName }) => <tr className="border-t" key={plan.id}><td className="px-4 py-3 font-medium">{plan.code}</td><td>{plan.name}</td><td>{serviceTypeName}</td><td className="text-right tabular-nums">{peso(plan.priceCentavos)}</td><td className="text-right">{plan.isActive ? "Active" : "Inactive"}</td>{canManage && <td className="space-x-2 whitespace-nowrap pr-4 text-right"><Button aria-label={`Edit ${plan.code}`} onClick={() => { setEditingPlan(plan); setShowForm(false); }} size="sm" variant="outline">Edit</Button><Button aria-label={`${plan.isActive ? "Deactivate" : "Activate"} ${plan.code}`} onClick={() => setStatusPlan(plan)} size="sm" variant="outline">{plan.isActive ? "Deactivate" : "Activate"}</Button></td>}</tr>)}</tbody></table></div>
    <ConfirmationDialog open={statusPlan !== null} title={statusPlan?.isActive ? "Deactivate plan?" : "Activate plan?"} description={statusPlan?.isActive ? "This plan will be unavailable for new assignments. Existing services keep their current rate and finalized invoices remain unchanged." : "This plan will become available for new assignments."} details={statusPlan ? `${statusPlan.code} · ${statusPlan.name}` : undefined} confirmLabel={statusPlan?.isActive ? "Deactivate plan" : "Activate plan"} busy={statusBusy} onConfirm={() => void togglePlan()} onCancel={() => setStatusPlan(null)} />
  </section>;
}

function PlanForm({ token, types, onCreated }: { token: string; types: Array<{ id: string; code: string; name: string }>; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ code: "", name: "", typeId: types[0]?.id ?? "", typeCode: types[0]?.code ?? "", price: "", speed: "", channels: "" });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); try { await createPlan(token, { code: form.code, serviceTypeId: form.typeId, name: form.name, description: "", priceCentavos: pesosToCentavos(form.price), installationFeeCentavos: "0", reconnectionFeeCentavos: "0", internetSpeedMbps: form.speed ? Number(form.speed) : undefined, cableChannelCount: form.channels ? Number(form.channels) : undefined }); await onCreated(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The plan could not be created."); } }
  return <form className="mt-5 rounded-lg border bg-muted/30 p-4" onSubmit={submit}><div className="grid gap-3 md:grid-cols-3"><Field label="Code"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field><Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Service type"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.typeId} onChange={(e) => { const type = types.find((candidate) => candidate.id === e.target.value); setForm({ ...form, typeId: e.target.value, typeCode: type?.code ?? "" }); }}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field><Field label="Monthly price (PHP)"><Input required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>{(form.typeCode === "INTERNET" || form.typeCode === "COMBO") && <Field label="Speed Mbps"><Input required type="number" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} /></Field>}{(form.typeCode === "CABLE" || form.typeCode === "COMBO") && <Field label="Channel count"><Input required type="number" value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} /></Field>}</div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<Button className="mt-4" type="submit" variant="accent">Create plan</Button></form>;
}

const editPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000),
  price: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter pesos with up to two decimal places."),
  installationFee: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter pesos with up to two decimal places."),
  reconnectionFee: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter pesos with up to two decimal places.")
});

function EditPlanForm({ token, plan, onSaved, onCancel }: { token: string; plan: ServicePlan; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof editPlanSchema>>({ resolver: zodResolver(editPlanSchema), defaultValues: { name: plan.name, description: plan.description, price: centavosToPesos(plan.priceCentavos), installationFee: centavosToPesos(plan.installationFeeCentavos), reconnectionFee: centavosToPesos(plan.reconnectionFeeCentavos) } });
  async function submit(values: z.infer<typeof editPlanSchema>) {
    try {
      setError("");
      await updatePlan(token, plan.id, { name: values.name, description: values.description, priceCentavos: pesosToCentavos(values.price), installationFeeCentavos: pesosToCentavos(values.installationFee), reconnectionFeeCentavos: pesosToCentavos(values.reconnectionFee), version: plan.version });
      await onSaved();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The plan could not be saved."); }
  }
  const field = (name: "name" | "description" | "price" | "installationFee" | "reconnectionFee", label: string) => <label className="space-y-2 text-sm">{label}<Input inputMode={name === "name" || name === "description" ? undefined : "decimal"} {...form.register(name)} />{form.formState.errors[name] && <span className="block text-xs text-danger">{form.formState.errors[name]?.message}</span>}</label>;
  return <form className="mt-5 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Edit plan {plan.code}</h3><p className="mt-1 text-sm text-muted-foreground">A monthly price change updates existing non-terminated services for future billing. Finalized invoices remain unchanged.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{field("name", "Plan name")}{field("description", "Description")}{field("price", "Monthly price (PHP)")}{field("installationFee", "Installation fee (PHP)")}{field("reconnectionFee", "Reconnection fee (PHP)")}</div>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button disabled={form.formState.isSubmitting} type="submit" variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save plan"}</Button><Button onClick={onCancel} type="button" variant="outline">Cancel</Button></div></form>;
}

function pesosToCentavos(value: string) { const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!match) throw new Error("Enter a valid peso amount."); return (BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString(); }
function centavosToPesos(value: string) { const centavos = BigInt(value); return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, "0")}`; }
function peso(value: string) { const centavos = BigInt(value); const whole = centavos / 100n; const fraction = (centavos % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-PH")}.${fraction}`; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
