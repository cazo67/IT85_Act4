import { Search, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, addSubscriberAddress, addSubscriberContact, assignCollector, createServiceAccount, createSubscriber, deactivateSubscriberAddress, deactivateSubscriberContact, getCollectionSetup, getSubscriber, listCollectorAssignments, listPlans, listSubscribers, replaceSubscriberAddress, replaceSubscriberContact, updateServiceAccountDetails, updateSubscriberIdentity, updateSubscriberStatus, type CollectionSetup, type ServicePlan, type SubscriberListItem, type SubscriberProfileData } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { SubscriberLedger } from "./SubscriberLedger";
import { StatementOfAccount } from "./StatementOfAccount";

export function SubscriberPanel({ token, openSubscriberId, canCreate, canEdit, canManageServices, canManageCollections, canViewReceivables, canViewReports, canExportReports }: { token: string; openSubscriberId?: string | undefined; canCreate: boolean; canEdit: boolean; canManageServices: boolean; canManageCollections: boolean; canViewReceivables: boolean; canViewReports: boolean; canExportReports: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "new" | "profile">(openSubscriberId ? "profile" : "list");
  const [selectedId, setSelectedId] = useState(openSubscriberId ?? "");
  const subscribers = useQuery({ queryKey: queryKeys.subscribers.list(search, page), queryFn: () => listSubscribers(token, search, page), enabled: view === "list" });
  const columns = useMemo<ColumnDef<SubscriberListItem>[]>(() => [
    { accessorKey: "accountNumber", header: "Account", cell: ({ row }) => <span className="font-medium">{row.original.accountNumber}</span> },
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}` },
    { accessorKey: "status", header: "Status" },
    { id: "billingDue", header: "Billing / Due", cell: ({ row }) => `${row.original.billingDay} / ${row.original.dueDay}` }
  ], []);
  const table = useReactTable({ data: subscribers.data?.items ?? [], columns, getCoreRowModel: getCoreRowModel() });

  function applySearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  if (view === "new") return <NewSubscriber token={token} onCancel={() => setView("list")} onCreated={(id) => { setSelectedId(id); setView("profile"); }} />;
  if (view === "profile") return <SubscriberProfile token={token} subscriberId={selectedId} canEdit={canEdit} canManageServices={canManageServices} canManageCollections={canManageCollections} canViewReceivables={canViewReceivables} canViewReports={canViewReports} canExportReports={canExportReports} onBack={() => setView("list")} />;

  return <section className="rounded-xl border bg-surface p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Subscribers</h2><p className="text-sm text-muted-foreground">Server-side account, name, contact, and address search</p></div>{canCreate && <Button onClick={() => setView("new")} variant="accent"><UserPlus />New subscriber</Button>}</div><div className="mt-5 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search account, name, contact, or address" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applySearch()} /></div><Button disabled={subscribers.isFetching} onClick={applySearch} variant="outline">Search</Button></div>{subscribers.isPending && <div className="mt-5"><LoadingState label="Loading subscribers…" /></div>}{subscribers.isError && <div className="mt-5"><ErrorState message={message(subscribers.error)} onRetry={() => void subscribers.refetch()} /></div>}{subscribers.data && <><div className="mt-5 overflow-auto rounded-lg border"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-muted">{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header, index) => <th className={index === 0 ? "px-4 py-3" : "py-3"} key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr className="cursor-pointer border-t hover:bg-muted/50" key={row.id} onClick={() => { setSelectedId(row.original.id); setView("profile"); }}>{row.getVisibleCells().map((cell, index) => <td className={index === 0 ? "px-4 py-3" : "py-3"} key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}{table.getRowModel().rows.length === 0 && <tr><td colSpan={columns.length}><EmptyState title="No subscribers found" detail="Try another account, name, contact, or address." /></td></tr>}</tbody></table></div><div className="mt-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {subscribers.data.page}</p><div className="flex gap-2"><Button disabled={page === 1 || subscribers.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="outline">Previous</Button><Button disabled={!subscribers.data.hasMore || subscribers.isFetching} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button></div></div></>}</section>;
}

const newSubscriberSchema = z.object({
  firstName: z.string().trim().min(2, "Enter at least 2 characters.").max(100),
  middleName: z.string().max(100),
  lastName: z.string().trim().min(2, "Enter at least 2 characters.").max(100),
  mobile: z.string().trim().min(3, "Enter a valid contact number.").max(150),
  line1: z.string().trim().min(3, "Enter a complete address.").max(180),
  barangay: z.string().trim().min(2, "Enter a barangay.").max(100),
  cityMunicipality: z.string().trim().min(2, "Enter a city or municipality.").max(100),
  province: z.string().trim().min(2, "Enter a province.").max(100),
  postalCode: z.string().max(12),
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  notes: z.string().max(2000)
});

type NewSubscriberForm = z.infer<typeof newSubscriberSchema>;

function NewSubscriber({ token, onCancel, onCreated }: { token: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [error, setError] = useState("");
  const form = useForm<NewSubscriberForm>({ resolver: zodResolver(newSubscriberSchema), defaultValues: { firstName: "", middleName: "", lastName: "", mobile: "", line1: "", barangay: "", cityMunicipality: "", province: "Bukidnon", postalCode: "", billingDay: 1, dueDay: 10, notes: "" } });

  async function submit(values: NewSubscriberForm) {
    try {
      const created = await createSubscriber(token, { firstName: values.firstName, middleName: values.middleName || undefined, lastName: values.lastName, billingDay: values.billingDay, dueDay: values.dueDay, notes: values.notes, addresses: [{ type: "SERVICE", line1: values.line1, barangay: values.barangay, cityMunicipality: values.cityMunicipality, province: values.province, postalCode: values.postalCode || undefined, isPrimary: true }], contacts: [{ type: "MOBILE", value: values.mobile, isPrimary: true }] });
      onCreated(created.id);
    } catch (caught) { setError(message(caught)); }
  }

  const fieldError = (name: keyof NewSubscriberForm) => form.formState.errors[name]?.message;
  return <form className="rounded-xl border bg-surface p-6" onSubmit={form.handleSubmit(submit)} noValidate><h2 className="text-lg font-semibold">New subscriber</h2><p className="text-sm text-muted-foreground">Account number is generated transactionally by the server.</p><div className="mt-5 grid gap-4 md:grid-cols-3"><Field error={fieldError("firstName")} label="First name"><Input {...form.register("firstName")} /></Field><Field error={fieldError("middleName")} label="Middle name"><Input {...form.register("middleName")} /></Field><Field error={fieldError("lastName")} label="Last name"><Input {...form.register("lastName")} /></Field><Field error={fieldError("mobile")} label="Mobile"><Input {...form.register("mobile")} /></Field><Field error={fieldError("billingDay")} label="Billing day (1–28)"><Input min="1" max="28" type="number" {...form.register("billingDay", { valueAsNumber: true })} /></Field><Field error={fieldError("dueDay")} label="Due day (1–28)"><Input min="1" max="28" type="number" {...form.register("dueDay", { valueAsNumber: true })} /></Field><Field error={fieldError("line1")} label="Address line"><Input {...form.register("line1")} /></Field><Field error={fieldError("barangay")} label="Barangay"><Input {...form.register("barangay")} /></Field><Field error={fieldError("cityMunicipality")} label="City / Municipality"><Input {...form.register("cityMunicipality")} /></Field><Field error={fieldError("province")} label="Province"><Input {...form.register("province")} /></Field><Field error={fieldError("postalCode")} label="Postal code"><Input {...form.register("postalCode")} /></Field></div>{error && <p className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="outline">Cancel</Button><Button disabled={form.formState.isSubmitting} type="submit" variant="accent">{form.formState.isSubmitting ? "Creating…" : "Create subscriber"}</Button></div></form>;
}

function SubscriberProfile({ token, subscriberId, canEdit, canManageServices, canManageCollections, canViewReceivables, canViewReports, canExportReports, onBack }: { token: string; subscriberId: string; canEdit: boolean; canManageServices: boolean; canManageCollections: boolean; canViewReceivables: boolean; canViewReports: boolean; canExportReports: boolean; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getSubscriber>> | null>(null);
  const [plans, setPlans] = useState<Array<{ plan: ServicePlan }>>([]);
  const [collectionSetup, setCollectionSetup] = useState<CollectionSetup | null>(null);
  const [error, setError] = useState("");
  const [showService, setShowService] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [editContactId, setEditContactId] = useState("");
  const [deactivateContactId, setDeactivateContactId] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [editAddressId, setEditAddressId] = useState("");
  const [deactivateAddressId, setDeactivateAddressId] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);
  const [editServiceId, setEditServiceId] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivationBusy, setDeactivationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const load = useCallback(async () => { try { const [nextProfile, nextPlans, nextSetup] = await Promise.all([getSubscriber(token, subscriberId), listPlans(token, true), canManageCollections ? getCollectionSetup(token) : Promise.resolve(null)]); setProfile(nextProfile); setPlans(nextPlans); setCollectionSetup(nextSetup); } catch (caught) { setError(message(caught)); } }, [canManageCollections, subscriberId, token]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="rounded-xl border bg-surface p-6 text-danger">{error}</p>;
  if (!profile) return <p className="rounded-xl border bg-surface p-6 text-muted-foreground">Loading subscriber profile…</p>;
  const person = profile.subscriber;
  const hasOpenServices = profile.services.some((service) => String(service.account.status) !== "TERMINATED");
  const referencedAddressIds = new Set(profile.services.map((service) => service.account.installationAddressId));
  const activeAddressCount = profile.addresses.filter((address) => address.isActive).length;
  const selectedContact = profile.contacts.find((contact) => contact.id === editContactId);
  const selectedAddress = profile.addresses.find((address) => address.id === editAddressId);
  async function deactivate() {
    if (!profile) return;
    setDeactivationBusy(true);
    setMutationError("");
    try {
      await updateSubscriberStatus(token, profile.subscriber.id, { status: "INACTIVE", billingDay: profile.subscriber.billingDay, dueDay: profile.subscriber.dueDay, notes: String(profile.subscriber.notes ?? ""), version: Number(profile.subscriber.version), ...(profile.subscriber.collectionAreaId ? { collectionAreaId: String(profile.subscriber.collectionAreaId) } : {}), ...(profile.subscriber.assignedCollectorId ? { assignedCollectorId: String(profile.subscriber.assignedCollectorId) } : {}) });
      setConfirmDeactivate(false);
      await load();
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all });
    } catch (caught) { setMutationError(message(caught)); }
    finally { setDeactivationBusy(false); }
  }
  async function deactivateContact() {
    if (!deactivateContactId) return;
    setContactBusy(true);
    setMutationError("");
    try {
      await deactivateSubscriberContact(token, person.id, deactivateContactId, Number(person.version));
      setDeactivateContactId("");
      await load();
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all });
    } catch (caught) { setMutationError(message(caught)); }
    finally { setContactBusy(false); }
  }
  async function deactivateAddress() {
    if (!deactivateAddressId) return;
    setAddressBusy(true);
    setMutationError("");
    try {
      await deactivateSubscriberAddress(token, person.id, deactivateAddressId, Number(person.version));
      setDeactivateAddressId("");
      await load();
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all });
    } catch (caught) { setMutationError(message(caught)); }
    finally { setAddressBusy(false); }
  }
  return <section className="rounded-xl border bg-surface p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-accent">{String(person.accountNumber)}</p><h2 className="text-2xl font-semibold">{String(person.firstName)} {String(person.lastName)}</h2><p className="text-sm text-muted-foreground">{String(person.status)}</p></div><div className="flex flex-wrap gap-2">{canEdit && <Button onClick={() => setShowIdentity(!showIdentity)} variant="outline">Edit identity</Button>}{canEdit && <Button onClick={() => setShowContact(!showContact)} variant="outline">Add contact</Button>}{canEdit && <Button onClick={() => setShowAddress(!showAddress)} variant="outline">Add address</Button>}{canEdit && person.status === "ACTIVE" && <Button disabled={hasOpenServices} onClick={() => setConfirmDeactivate(true)} variant="destructive">Deactivate</Button>}{canManageServices && <Button onClick={() => setShowService(!showService)} variant="accent">Add service</Button>}<Button onClick={onBack} variant="outline">Back</Button></div></div>
    {canEdit && person.status === "ACTIVE" && hasOpenServices && <p className="mt-3 text-sm text-muted-foreground">Deactivate is unavailable while service accounts remain open. Close each service through its approved workflow first.</p>}
    {mutationError && <p className="mt-3 text-sm text-danger" role="alert">{mutationError}</p>}
    {showIdentity && <EditSubscriberIdentity token={token} profile={profile} onSaved={async () => { setShowIdentity(false); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setShowIdentity(false)} />}
    {showContact && <AddSubscriberContact token={token} profile={profile} onSaved={async () => { setShowContact(false); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setShowContact(false)} />}
    {selectedContact && <EditSubscriberContact key={selectedContact.id} token={token} profile={profile} contact={selectedContact} onSaved={async () => { setEditContactId(""); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setEditContactId("")} />}
    {showAddress && <AddSubscriberAddress token={token} profile={profile} onSaved={async () => { setShowAddress(false); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setShowAddress(false)} />}
    {selectedAddress && <EditSubscriberAddress key={selectedAddress.id} token={token} profile={profile} address={selectedAddress} onSaved={async () => { setEditAddressId(""); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setEditAddressId("")} />}
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Summary title="Addresses" lines={profile.addresses.filter((address) => address.isActive).map((address) => `${String(address.line1)}, ${String(address.barangay)}`)} /><Summary title="Contacts" lines={profile.contacts.filter((contact) => contact.isActive).map((contact) => `${String(contact.value)}${contact.isPrimary ? " (primary)" : ""}`)} /><Summary title="Services" lines={profile.services.map((service) => `${String(service.account.serviceAccountNumber)} · ${service.planName} · ${String(service.account.status)}`)} /><Summary title="Service history" lines={profile.serviceHistory.map((event) => `${String(event.type)} · ${String(event.description)}`)} /></div>
    {canEdit && <div className="mt-6 space-y-2"><h3 className="font-semibold">Manage contacts</h3>{profile.contacts.filter((contact) => contact.isActive).map((contact) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" key={contact.id}><p className="text-sm">{contact.type} · {contact.value}{contact.isPrimary ? " · Primary" : ""}</p><div className="flex gap-2"><Button aria-label={`Edit contact ${contact.value}`} onClick={() => setEditContactId(contact.id)} size="sm" variant="outline">Edit</Button><Button aria-label={`Deactivate contact ${contact.value}`} disabled={profile.contacts.filter((item) => item.isActive).length === 1} onClick={() => setDeactivateContactId(contact.id)} size="sm" variant="outline">Deactivate</Button></div></div>)}</div>}
    {canEdit && <div className="mt-6 space-y-2"><h3 className="font-semibold">Manage addresses</h3>{profile.addresses.filter((address) => address.isActive).map((address) => { const inUse = referencedAddressIds.has(address.id); return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" key={address.id}><div><p className="text-sm">{address.type} · {address.line1}, {address.barangay}{address.isPrimary ? " · Primary" : ""}</p>{inUse && <p className="text-xs text-muted-foreground">Used by a service account. Correct the service address first; historical references cannot be rewritten.</p>}</div><div className="flex gap-2"><Button aria-label={`Edit address ${address.line1}`} disabled={inUse} onClick={() => setEditAddressId(address.id)} size="sm" variant="outline">Edit</Button><Button aria-label={`Deactivate address ${address.line1}`} disabled={inUse || activeAddressCount === 1} onClick={() => setDeactivateAddressId(address.id)} size="sm" variant="outline">Deactivate</Button></div></div>; })}</div>}
    {profile.services.length > 0 && <div className="mt-6 space-y-3"><h3 className="font-semibold">Service account details</h3>{profile.services.map((service) => <div className="rounded-lg border p-4" key={service.account.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{service.account.serviceAccountNumber} · {service.planName}</p><p className="text-sm text-muted-foreground">{service.account.status} · Current rate {peso(service.account.currentRateCentavos)}</p><p className="text-sm text-muted-foreground">Service address: {String(profile.addresses.find((address) => address.id === service.account.installationAddressId)?.line1 ?? "Unavailable")}</p></div>{canManageServices && (service.account.status === "PENDING" || service.account.status === "ACTIVE") && <Button onClick={() => setEditServiceId(editServiceId === service.account.id ? "" : service.account.id)} variant="outline">Edit service details</Button>}</div>{editServiceId === service.account.id && <EditServiceAccount token={token} service={service} plans={plans} addresses={profile.addresses} onSaved={async () => { setEditServiceId(""); await load(); await queryClient.invalidateQueries({ queryKey: queryKeys.subscribers.all }); }} onCancel={() => setEditServiceId("")} />}</div>)}</div>}
    {showService && <NewService token={token} profile={profile} plans={plans} onCreated={async () => { setShowService(false); await load(); }} />}
    {canManageCollections && collectionSetup && profile.services.length > 0 && <CollectorAssignment token={token} profile={profile} setup={collectionSetup} onAssigned={load} />}
    <ConfirmationDialog open={confirmDeactivate} title="Deactivate subscriber?" description="The subscriber will remain in historical records and will no longer be eligible for new service accounts or billing. This action does not remove invoices, payments or ledger entries." confirmLabel="Deactivate subscriber" destructive busy={deactivationBusy} onConfirm={() => void deactivate()} onCancel={() => setConfirmDeactivate(false)} />
    <ConfirmationDialog open={Boolean(deactivateContactId)} title="Deactivate contact?" description="The contact will stop appearing in search and active details. Its historical row remains. If it is primary, another active contact becomes primary." confirmLabel="Deactivate contact" busy={contactBusy} onConfirm={() => void deactivateContact()} onCancel={() => setDeactivateContactId("")} />
    <ConfirmationDialog open={Boolean(deactivateAddressId)} title="Deactivate address?" description="The address will stop appearing in search and new service choices, but its historical row remains. If it is primary, another active address becomes primary." confirmLabel="Deactivate address" busy={addressBusy} onConfirm={() => void deactivateAddress()} onCancel={() => setDeactivateAddressId("")} />
    {canViewReceivables && <SubscriberLedger key={subscriberId} token={token} subscriberId={subscriberId} />}
    {canViewReports && <StatementOfAccount key={subscriberId} token={token} subscriberId={subscriberId} canExport={canExportReports} />}
  </section>;
}

const identitySchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  middleName: z.string().max(100),
  lastName: z.string().trim().min(2).max(100),
  suffix: z.string().max(20)
});

function EditSubscriberIdentity({ token, profile, onSaved, onCancel }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const person = profile.subscriber;
  const form = useForm<z.infer<typeof identitySchema>>({ resolver: zodResolver(identitySchema), defaultValues: { firstName: String(person.firstName), middleName: String(person.middleName ?? ""), lastName: String(person.lastName), suffix: String(person.suffix ?? "") } });
  async function submit(values: z.infer<typeof identitySchema>) {
    try {
      setError("");
      await updateSubscriberIdentity(token, person.id, { ...values, version: Number(person.version) });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Edit subscriber identity</h3><div className="mt-3 grid gap-3 md:grid-cols-4"><Field label="First name" error={form.formState.errors.firstName?.message}><Input {...form.register("firstName")} /></Field><Field label="Middle name" error={form.formState.errors.middleName?.message}><Input {...form.register("middleName")} /></Field><Field label="Last name" error={form.formState.errors.lastName?.message}><Input {...form.register("lastName")} /></Field><Field label="Suffix" error={form.formState.errors.suffix?.message}><Input {...form.register("suffix")} /></Field></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<div className="mt-4 flex gap-2"><Button type="submit" disabled={form.formState.isSubmitting} variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save identity"}</Button><Button type="button" onClick={onCancel} variant="outline">Cancel</Button></div></form>;
}

const contactFormSchema = z.object({
  type: z.enum(["MOBILE", "PHONE", "EMAIL", "OTHER"]),
  value: z.string().trim().min(3, "Enter a contact value.").max(150),
  isPrimary: z.boolean()
});

function AddSubscriberContact({ token, profile, onSaved, onCancel }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof contactFormSchema>>({ resolver: zodResolver(contactFormSchema), defaultValues: { type: "MOBILE", value: "", isPrimary: false } });
  async function submit(values: z.infer<typeof contactFormSchema>) {
    try {
      setError("");
      await addSubscriberContact(token, profile.subscriber.id, { ...values, version: Number(profile.subscriber.version) });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Add subscriber contact</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm">Contact type<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("type")}><option value="MOBILE">Mobile</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label><label className="space-y-2 text-sm">Contact value<Input {...form.register("value")} />{form.formState.errors.value && <span className="block text-xs text-danger">{form.formState.errors.value.message}</span>}</label></div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("isPrimary")} />Make this the primary contact</label>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button type="submit" disabled={form.formState.isSubmitting} variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save contact"}</Button><Button type="button" onClick={onCancel} variant="outline">Cancel</Button></div></form>;
}

function EditSubscriberContact({ token, profile, contact, onSaved, onCancel }: { token: string; profile: SubscriberProfileData; contact: SubscriberProfileData["contacts"][number]; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof contactFormSchema>>({ resolver: zodResolver(contactFormSchema), defaultValues: { type: contact.type, value: contact.value, isPrimary: contact.isPrimary } });
  async function submit(values: z.infer<typeof contactFormSchema>) {
    try {
      setError("");
      await replaceSubscriberContact(token, profile.subscriber.id, contact.id, { ...values, version: Number(profile.subscriber.version) });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Edit subscriber contact</h3><p className="mt-1 text-sm text-muted-foreground">Saving creates a new active contact and retains the old row as inactive history.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm">Contact type<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("type")}><option value="MOBILE">Mobile</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label><label className="space-y-2 text-sm">Contact value<Input {...form.register("value")} />{form.formState.errors.value && <span className="block text-xs text-danger">{form.formState.errors.value.message}</span>}</label></div><label className="mt-3 flex items-center gap-2 text-sm"><input disabled={contact.isPrimary} type="checkbox" {...form.register("isPrimary")} />{contact.isPrimary ? "Primary status stays with this replacement" : "Make this the primary contact"}</label>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button type="submit" disabled={form.formState.isSubmitting} variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save contact changes"}</Button><Button type="button" onClick={onCancel} variant="outline">Cancel</Button></div></form>;
}

const addressFormSchema = z.object({
  type: z.enum(["BILLING", "SERVICE", "MAILING", "OTHER"]),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().max(180),
  barangay: z.string().trim().min(2).max(100),
  cityMunicipality: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: z.string().max(12),
  isPrimary: z.boolean()
});

function AddSubscriberAddress({ token, profile, onSaved, onCancel }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof addressFormSchema>>({ resolver: zodResolver(addressFormSchema), defaultValues: { type: "SERVICE", line1: "", line2: "", barangay: "", cityMunicipality: "", province: "Bukidnon", postalCode: "", isPrimary: false } });
  async function submit(values: z.infer<typeof addressFormSchema>) {
    try {
      setError("");
      await addSubscriberAddress(token, profile.subscriber.id, { ...values, version: Number(profile.subscriber.version) });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  const field = (name: "line1" | "line2" | "barangay" | "cityMunicipality" | "province" | "postalCode", label: string) => <label className="space-y-2 text-sm">{label}<Input {...form.register(name)} />{form.formState.errors[name] && <span className="block text-xs text-danger">{form.formState.errors[name]?.message}</span>}</label>;
  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Add subscriber address</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="space-y-2 text-sm">Address type<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("type")}><option value="SERVICE">Service</option><option value="BILLING">Billing</option><option value="MAILING">Mailing</option><option value="OTHER">Other</option></select></label>{field("line1", "Address line")}{field("line2", "Address line 2")}{field("barangay", "Barangay")}{field("cityMunicipality", "City / Municipality")}{field("province", "Province")}{field("postalCode", "Postal code")}</div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("isPrimary")} />Make this the primary address</label>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button type="submit" disabled={form.formState.isSubmitting} variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save address"}</Button><Button type="button" onClick={onCancel} variant="outline">Cancel</Button></div></form>;
}

function EditSubscriberAddress({ token, profile, address, onSaved, onCancel }: { token: string; profile: SubscriberProfileData; address: SubscriberProfileData["addresses"][number]; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof addressFormSchema>>({ resolver: zodResolver(addressFormSchema), defaultValues: { type: address.type, line1: address.line1, line2: address.line2 ?? "", barangay: address.barangay, cityMunicipality: address.cityMunicipality, province: address.province, postalCode: address.postalCode ?? "", isPrimary: address.isPrimary } });
  async function submit(values: z.infer<typeof addressFormSchema>) {
    try {
      setError("");
      await replaceSubscriberAddress(token, profile.subscriber.id, address.id, { ...values, version: Number(profile.subscriber.version) });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  const field = (name: "line1" | "line2" | "barangay" | "cityMunicipality" | "province" | "postalCode", label: string) => <label className="space-y-2 text-sm">{label}<Input {...form.register(name)} />{form.formState.errors[name] && <span className="block text-xs text-danger">{form.formState.errors[name]?.message}</span>}</label>;
  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h3 className="font-medium">Edit subscriber address</h3><p className="mt-1 text-sm text-muted-foreground">Saving creates a new active address and retains the old row as inactive history.</p><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="space-y-2 text-sm">Address type<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("type")}><option value="SERVICE">Service</option><option value="BILLING">Billing</option><option value="MAILING">Mailing</option><option value="OTHER">Other</option></select></label>{field("line1", "Address line")}{field("line2", "Address line 2")}{field("barangay", "Barangay")}{field("cityMunicipality", "City / Municipality")}{field("province", "Province")}{field("postalCode", "Postal code")}</div><label className="mt-3 flex items-center gap-2 text-sm"><input disabled={address.isPrimary} type="checkbox" {...form.register("isPrimary")} />{address.isPrimary ? "Primary status stays with this replacement" : "Make this the primary address"}</label>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button type="submit" disabled={form.formState.isSubmitting} variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save address changes"}</Button><Button type="button" onClick={onCancel} variant="outline">Cancel</Button></div></form>;
}

const serviceDetailsSchema = z.object({
  planId: z.string().uuid(),
  installationAddressId: z.string().uuid(),
  reason: z.string().trim().min(3, "Explain the change.").max(500)
});

function EditServiceAccount({ token, service, plans, addresses, onSaved, onCancel }: { token: string; service: Awaited<ReturnType<typeof getSubscriber>>["services"][number]; plans: Array<{ plan: ServicePlan }>; addresses: Array<Record<string, unknown>>; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof serviceDetailsSchema>>({ resolver: zodResolver(serviceDetailsSchema), defaultValues: { planId: service.account.planId, installationAddressId: service.account.installationAddressId, reason: "" } });
  const availablePlans = plans.filter(({ plan }) => plan.isActive || plan.id === service.account.planId);
  const availableAddresses = addresses.filter((address) => address.isActive);
  async function submit(values: z.infer<typeof serviceDetailsSchema>) {
    try {
      setError("");
      await updateServiceAccountDetails(token, service.account.id, { ...values, status: service.account.status, version: service.account.version });
      await onSaved();
    } catch (caught) { setError(message(caught)); }
  }
  return <form className="mt-4 rounded-lg border bg-muted/30 p-4" noValidate onSubmit={form.handleSubmit(submit)}><h4 className="font-medium">Edit service account</h4><p className="mt-1 text-sm text-muted-foreground">Plan changes affect this service's future rate. Existing invoices remain unchanged. Suspension and reconnection use the separate approved workflow.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm">Plan<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("planId")}>{availablePlans.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.name}{plan.isActive ? "" : " (inactive; keep only)"} · {peso(plan.priceCentavos)}</option>)}</select>{form.formState.errors.planId && <span className="block text-xs text-danger">{form.formState.errors.planId.message}</span>}</label><label className="space-y-2 text-sm">Service address<select className="flex h-10 w-full rounded-md border bg-background px-3" {...form.register("installationAddressId")}>{availableAddresses.map((address) => <option key={String(address.id)} value={String(address.id)}>{String(address.line1)}</option>)}</select>{form.formState.errors.installationAddressId && <span className="block text-xs text-danger">{form.formState.errors.installationAddressId.message}</span>}</label></div><label className="mt-3 block space-y-2 text-sm">Reason<Input {...form.register("reason")} />{form.formState.errors.reason && <span className="block text-xs text-danger">{form.formState.errors.reason.message}</span>}</label>{error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}<div className="mt-4 flex gap-2"><Button disabled={form.formState.isSubmitting} type="submit" variant="accent">{form.formState.isSubmitting ? "Saving…" : "Save service details"}</Button><Button onClick={onCancel} type="button" variant="outline">Cancel</Button></div></form>;
}

function NewService({ token, profile, plans, onCreated }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; plans: Array<{ plan: ServicePlan }>; onCreated: () => Promise<void> }) {
  const activeAddresses = profile.addresses.filter((address) => address.isActive);
  const activePlans = plans.filter(({ plan }) => plan.isActive);
  const [planId, setPlanId] = useState(activePlans[0]?.plan.id ?? "");
  const [addressId, setAddressId] = useState(String(activeAddresses[0]?.id ?? ""));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  async function submit() { try { await createServiceAccount(token, { subscriberId: profile.subscriber.id, planId, installationAddressId: addressId, billingStartDate: startDate, activationDate: startDate, billingDay: profile.subscriber.billingDay, dueDay: profile.subscriber.dueDay }); await onCreated(); } catch (caught) { setError(message(caught)); } }
  return <div className="mt-6 rounded-lg border bg-muted/30 p-4"><h3 className="font-medium">New service account</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)}>{activePlans.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.name} · {peso(plan.priceCentavos)}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={addressId} onChange={(e) => setAddressId(e.target.value)}>{activeAddresses.map((address) => <option key={String(address.id)} value={String(address.id)}>{String(address.line1)}</option>)}</select><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<Button className="mt-3" onClick={() => void submit()} variant="accent">Create service</Button></div>;
}

function CollectorAssignment({ token, profile, setup, onAssigned }: { token: string; profile: Awaited<ReturnType<typeof getSubscriber>>; setup: CollectionSetup; onAssigned: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [serviceAccountId, setServiceAccountId] = useState(String(profile.services[0]?.account.id ?? ""));
  const activeCollectors = setup.collectors.filter((collector) => collector.isActive);
  const activeRoutes = setup.routes.filter((route) => route.isActive && setup.areas.some((area) => area.id === route.areaId && area.isActive));
  const assignments = useQuery({ queryKey: queryKeys.collectorAssignments(serviceAccountId), queryFn: () => listCollectorAssignments(token, serviceAccountId), enabled: Boolean(serviceAccountId) });
  const current = assignments.data?.find((item) => item.effectiveTo === null);
  const [collectorId, setCollectorId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCollectorId(current && activeCollectors.some((item) => item.id === current.collectorId) ? current.collectorId : activeCollectors[0]?.id ?? "");
    setRouteId(current?.routeId && activeRoutes.some((item) => item.id === current.routeId) ? current.routeId : "");
    setError("");
  }, [serviceAccountId, assignments.data, setup]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !collectorId || assignments.isPending || assignments.isError) return;
    setBusy(true);
    try {
      await assignCollector(token, { serviceAccountId, collectorId, routeId: routeId || undefined, effectiveFrom });
      setError("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.collectorAssignments(serviceAccountId) });
      await onAssigned();
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  return <form className="mt-6 rounded-lg border bg-muted/30 p-4" onSubmit={submit}>
    <h3 className="font-medium">Collector assignment</h3>
    <p className="text-sm text-muted-foreground">A new assignment closes the previous open assignment at its start date. Saved route sheets and earlier assignment dates remain unchanged.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <div><Label htmlFor="assignment-service">Service account</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" id="assignment-service" value={serviceAccountId} onChange={(event) => setServiceAccountId(event.target.value)}>{profile.services.map((service) => <option key={String(service.account.id)} value={String(service.account.id)}>{String(service.account.serviceAccountNumber)}</option>)}</select></div>
      <div><Label htmlFor="assignment-collector">Collector</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" id="assignment-collector" required value={collectorId} onChange={(event) => setCollectorId(event.target.value)}><option value="" disabled>Select collector</option>{activeCollectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.displayName}</option>)}</select></div>
      <div><Label htmlFor="assignment-route">Route</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" id="assignment-route" value={routeId} onChange={(event) => setRouteId(event.target.value)}><option value="">No route</option>{activeRoutes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></div>
      <div><Label htmlFor="assignment-date">Effective from</Label><Input className="mt-1" id="assignment-date" required type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div>
    </div>
    {assignments.isPending && <p className="mt-3 text-sm text-muted-foreground" role="status">Loading collector assignments…</p>}
    {assignments.isError && <p className="mt-3 text-sm text-danger" role="alert">Assignment history could not be loaded. <Button onClick={() => void assignments.refetch()} size="sm" type="button" variant="outline">Retry</Button></p>}
    {assignments.isSuccess && <div className="mt-4 rounded-lg border bg-surface p-3"><h4 className="text-sm font-medium">Assignment history</h4>{assignments.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No collector assigned to this service yet.</p> : <ul className="mt-2 space-y-2">{assignments.data.map((item) => <li className="text-sm" key={item.id}>{item.effectiveTo === null ? "Current" : "Previous"}: {item.collectorName} · {item.routeName ?? "No route"} · {item.effectiveFrom} to {item.effectiveTo ?? "open"}</li>)}</ul>}</div>}
    {current && <p className="mt-2 text-xs text-muted-foreground">The replacement date must be after {current.effectiveFrom}.</p>}
    {activeCollectors.length === 0 && <p className="mt-3 text-sm text-danger" role="alert">No active collector is available. Create one in Collection setup first.</p>}
    {routeId === "" && <p className="mt-2 text-xs text-muted-foreground">An assignment without a route will not appear on a route sheet.</p>}
    {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    <Button className="mt-3" disabled={busy || activeCollectors.length === 0 || assignments.isPending || assignments.isError} type="submit" variant="accent">{busy ? "Saving…" : current ? "Change assignment" : "Assign collector"}</Button>
  </form>;
}

function Summary({ title, lines }: { title: string; lines: string[] }) { return <div className="rounded-lg border p-4"><h3 className="text-sm font-medium">{title}</h3>{lines.length ? lines.map((line, index) => <p className="mt-2 text-sm text-muted-foreground" key={`${line}-${index}`}>{line}</p>) : <p className="mt-2 text-sm text-muted-foreground">None</p>}</div>; }
function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}{error && <p className="text-xs text-danger">{error}</p>}</div>; }
function message(error: unknown) { return error instanceof ApiError ? error.message : "The request could not be completed."; }
function peso(value: string) { const centavos = BigInt(value); const whole = centavos / 100n; const fraction = (centavos % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-PH")}.${fraction}`; }
