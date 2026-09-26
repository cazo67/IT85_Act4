import { Search, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, assignCollector, createServiceAccount, createSubscriber, getCollectionSetup, getStatement, getSubscriber, listPlans, listSubscribers, type CollectionSetup, type ServicePlan, type SubscriberListItem } from "@/lib/api-client";

export function SubscriberPanel({ token, canCreate, canManageServices, canManageCollections, canViewReceivables }: { token: string; canCreate: boolean; canManageServices: boolean; canManageCollections: boolean; canViewReceivables: boolean }) {
  const [items, setItems] = useState<SubscriberListItem[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "new" | "profile">("list");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { setItems((await listSubscribers(token, search)).items); setError(""); }
    catch (caught) { setError(message(caught)); }
  }, [search, token]);

  useEffect(() => { if (view === "list") void refresh(); }, [refresh, view]);

  if (view === "new") return <NewSubscriber token={token} onCancel={() => setView("list")} onCreated={(id) => { setSelectedId(id); setView("profile"); }} />;
  if (view === "profile") return <SubscriberProfile token={token} subscriberId={selectedId} canManageServices={canManageServices} canManageCollections={canManageCollections} canViewReceivables={canViewReceivables} onBack={() => setView("list")} />;

  return <section className="rounded-xl border bg-surface p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Subscribers</h2><p className="text-sm text-muted-foreground">Server-side account, name, contact, and address search</p></div>{canCreate && <Button onClick={() => setView("new")} variant="accent"><UserPlus />New subscriber</Button>}</div><div className="mt-5 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search account, name, contact, or address" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void refresh()} /></div><Button onClick={() => void refresh()} variant="outline">Search</Button></div>{error && <p className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-5 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-4 py-3">Account</th><th>Subscriber</th><th>Status</th><th>Billing / Due</th></tr></thead><tbody>{items.map((subscriber) => <tr className="cursor-pointer border-t hover:bg-muted/50" key={subscriber.id} onClick={() => { setSelectedId(subscriber.id); setView("profile"); }}><td className="px-4 py-3 font-medium">{subscriber.accountNumber}</td><td>{subscriber.firstName} {subscriber.lastName}</td><td>{subscriber.status}</td><td>{subscriber.billingDay} / {subscriber.dueDay}</td></tr>)}{items.length === 0 && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>No subscribers match the current search.</td></tr>}</tbody></table></div></section>;
}

function NewSubscriber({ token, onCancel, onCreated }: { token: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", mobile: "", line1: "", barangay: "", cityMunicipality: "", province: "Bukidnon", postalCode: "", billingDay: "1", dueDay: "10", notes: "" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const created = await createSubscriber(token, { firstName: form.firstName, middleName: form.middleName || undefined, lastName: form.lastName, billingDay: Number(form.billingDay), dueDay: Number(form.dueDay), notes: form.notes, addresses: [{ type: "SERVICE", line1: form.line1, barangay: form.barangay, cityMunicipality: form.cityMunicipality, province: form.province, postalCode: form.postalCode || undefined, isPrimary: true }], contacts: [{ type: "MOBILE", value: form.mobile, isPrimary: true }] });
      onCreated(created.id);
    } catch (caught) { setError(message(caught)); }
  }

  return <form className="rounded-xl border bg-surface p-6" onSubmit={submit}><h2 className="text-lg font-semibold">New subscriber</h2><p className="text-sm text-muted-foreground">Account number is generated transactionally by the server.</p><div className="mt-5 grid gap-4 md:grid-cols-3"><Field label="First name"><Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field><Field label="Middle name"><Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} /></Field><Field label="Last name"><Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field><Field label="Mobile"><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field><Field label="Billing day (1–28)"><Input min="1" max="28" type="number" value={form.billingDay} onChange={(e) => setForm({ ...form, billingDay: e.target.value })} /></Field><Field label="Due day (1–28)"><Input min="1" max="28" type="number" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} /></Field><Field label="Address line"><Input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></Field><Field label="Barangay"><Input required value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })} /></Field><Field label="City / Municipality"><Input required value={form.cityMunicipality} onChange={(e) => setForm({ ...form, cityMunicipality: e.target.value })} /></Field><Field label="Province"><Input required value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field><Field label="Postal code"><Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field></div>{error && <p className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="outline">Cancel</Button><Button type="submit" variant="accent">Create subscriber</Button></div></form>;
}

function SubscriberProfile({ token, subscriberId, canManageServices, canManageCollections, canViewReceivables, onBack }: { token: string; subscriberId: string; canManageServices: boolean; canManageCollections: boolean; canViewReceivables: boolean; onBack: () => void }) {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getSubscriber>> | null>(null);
  const [plans, setPlans] = useState<Array<{ plan: ServicePlan }>>([]);
  const [collectionSetup, setCollectionSetup] = useState<CollectionSetup | null>(null);
  const [statement, setStatement] = useState<Awaited<ReturnType<typeof getStatement>> | null>(null);
  const [error, setError] = useState("");
  const [showService, setShowService] = useState(false);
  const load = useCallback(async () => { try { const [nextProfile, nextPlans, nextSetup, nextStatement] = await Promise.all([getSubscriber(token, subscriberId), listPlans(token), canManageCollections ? getCollectionSetup(token) : Promise.resolve(null), canViewReceivables ? getStatement(token, subscriberId) : Promise.resolve(null)]); setProfile(nextProfile); setPlans(nextPlans); setCollectionSetup(nextSetup); setStatement(nextStatement); } catch (caught) { setError(message(caught)); } }, [canManageCollections, canViewReceivables, subscriberId, token]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="rounded-xl border bg-surface p-6 text-danger">{error}</p>;
  if (!profile) return <p className="rounded-xl border bg-surface p-6 text-muted-foreground">Loading subscriber profile…</p>;
  const person = profile.subscriber;
  return <section className="rounded-xl border bg-surface p-6"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-accent">{String(person.accountNumber)}</p><h2 className="text-2xl font-semibold">{String(person.firstName)} {String(person.lastName)}</h2><p className="text-sm text-muted-foreground">{String(person.status)}</p></div><div className="flex gap-2">{canManageServices && <Button onClick={() => setShowService(!showService)} variant="accent">Add service</Button>}<Button onClick={onBack} variant="outline">Back</Button></div></div><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Summary title="Addresses" lines={profile.addresses.map((address) => `${String(address.line1)}, ${String(address.barangay)}`)} /><Summary title="Contacts" lines={profile.contacts.map((contact) => String(contact.value))} /><Summary title="Services" lines={profile.services.map((service) => `${String(service.account.serviceAccountNumber)} · ${service.planName} · ${String(service.account.status)}`)} /><Summary title="Service history" lines={profile.serviceHistory.map((event) => `${String(event.type)} · ${String(event.description)}`)} />{statement && <Summary title="Ledger / SOA" lines={[`Balance ${peso(statement.closingBalanceCentavos)}`, ...statement.entries.slice(-4).map((entry) => String(entry.description))]} />}</div>{showService && <NewService token={token} profile={profile} plans={plans} onCreated={async () => { setShowService(false); await load(); }} />}{canManageCollections && collectionSetup && profile.services.length > 0 && <CollectorAssignment token={token} profile={profile} setup={collectionSetup} onAssigned={load} />}</section>;
}

function NewService({ token, profile, plans, onCreated }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; plans: Array<{ plan: ServicePlan }>; onCreated: () => Promise<void> }) {
  const [planId, setPlanId] = useState(plans[0]?.plan.id ?? "");
  const [addressId, setAddressId] = useState(String(profile.addresses[0]?.id ?? ""));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  async function submit() { try { await createServiceAccount(token, { subscriberId: profile.subscriber.id, planId, installationAddressId: addressId, billingStartDate: startDate, activationDate: startDate, billingDay: profile.subscriber.billingDay, dueDay: profile.subscriber.dueDay }); await onCreated(); } catch (caught) { setError(message(caught)); } }
  return <div className="mt-6 rounded-lg border bg-muted/30 p-4"><h3 className="font-medium">New service account</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.name} · {peso(plan.priceCentavos)}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={addressId} onChange={(e) => setAddressId(e.target.value)}>{profile.addresses.map((address) => <option key={String(address.id)} value={String(address.id)}>{String(address.line1)}</option>)}</select><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<Button className="mt-3" onClick={() => void submit()} variant="accent">Create service</Button></div>;
}

function CollectorAssignment({ token, profile, setup, onAssigned }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; setup: CollectionSetup; onAssigned: () => Promise<void> }) {
  const [serviceAccountId, setServiceAccountId] = useState(String(profile.services[0]?.account.id ?? ""));
  const [collectorId, setCollectorId] = useState(setup.collectors[0]?.id ?? "");
  const [routeId, setRouteId] = useState(setup.routes[0]?.id ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await assignCollector(token, { serviceAccountId, collectorId, routeId: routeId || undefined, effectiveFrom }); setError(""); await onAssigned(); }
    catch (caught) { setError(message(caught)); }
  }

  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" onSubmit={submit}><h3 className="font-medium">Collector assignment</h3><p className="text-sm text-muted-foreground">A new assignment closes the previous active assignment and preserves its history.</p><div className="mt-3 grid gap-3 md:grid-cols-4"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={serviceAccountId} onChange={(event) => setServiceAccountId(event.target.value)}>{profile.services.map((service) => <option key={String(service.account.id)} value={String(service.account.id)}>{String(service.account.serviceAccountNumber)}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={collectorId} onChange={(event) => setCollectorId(event.target.value)}><option value="" disabled>Select collector</option>{setup.collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.displayName}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={routeId} onChange={(event) => setRouteId(event.target.value)}><option value="">No route</option>{setup.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select><Input required type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<Button className="mt-3" type="submit" variant="accent">Assign collector</Button></form>;
}

function Summary({ title, lines }: { title: string; lines: string[] }) { return <div className="rounded-lg border p-4"><h3 className="text-sm font-medium">{title}</h3>{lines.length ? lines.map((line, index) => <p className="mt-2 text-sm text-muted-foreground" key={`${line}-${index}`}>{line}</p>) : <p className="mt-2 text-sm text-muted-foreground">None</p>}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function message(error: unknown) { return error instanceof ApiError ? error.message : "The request could not be completed."; }
function peso(value: string) { const centavos = BigInt(value); const whole = centavos / 100n; const fraction = (centavos % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-PH")}.${fraction}`; }
