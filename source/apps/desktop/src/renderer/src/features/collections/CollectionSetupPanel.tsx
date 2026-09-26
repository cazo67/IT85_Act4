import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, createCollectionArea, createCollectionRoute, createCollector, getCollectionSetup, type CollectionSetup } from "@/lib/api-client";

export function CollectionSetupPanel({ token }: { token: string }) {
  const [setup, setSetup] = useState<CollectionSetup>({ areas: [], routes: [], collectors: [] });
  const [kind, setKind] = useState<"area" | "route" | "collector">("area");
  const [form, setForm] = useState({ code: "", name: "", areaId: "", extra: "" });
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const next = await getCollectionSetup(token); setSetup(next); setForm((current) => ({ ...current, areaId: current.areaId || next.areas[0]?.id || "" })); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Collection setup could not be loaded."); } }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (kind === "area") await createCollectionArea(token, { code: form.code, name: form.name, description: form.extra });
      if (kind === "route") await createCollectionRoute(token, { areaId: form.areaId, code: form.code, name: form.name, scheduleNotes: form.extra });
      if (kind === "collector") await createCollector(token, { code: form.code, displayName: form.name, contactNumber: form.extra || undefined });
      setForm({ code: "", name: "", areaId: setup.areas[0]?.id ?? "", extra: "" });
      setError("");
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The record could not be created."); }
  }

  return <div className="grid gap-6 lg:grid-cols-[1fr_22rem]"><section className="rounded-xl border bg-surface p-6"><h2 className="text-lg font-semibold">Areas, routes, and collectors</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><List title="Areas" items={setup.areas.map((item) => `${item.code} · ${item.name}`)} /><List title="Routes" items={setup.routes.map((item) => `${item.code} · ${item.name}`)} /><List title="Collectors" items={setup.collectors.map((item) => `${item.code} · ${item.displayName}`)} /></div></section><form className="h-fit rounded-xl border bg-surface p-6" onSubmit={submit}><h2 className="font-semibold">Add setup record</h2><div className="mt-4 flex gap-1">{(["area", "route", "collector"] as const).map((value) => <Button key={value} onClick={() => setKind(value)} size="sm" type="button" variant={kind === value ? "default" : "outline"}>{value}</Button>)}</div><div className="mt-4 space-y-3"><Input placeholder="Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><Input placeholder={kind === "collector" ? "Collector name" : "Name"} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />{kind === "route" && <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>{setup.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>}<Input placeholder={kind === "collector" ? "Contact number" : kind === "route" ? "Schedule notes" : "Description"} value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />{error && <p className="text-sm text-danger">{error}</p>}<Button className="w-full" type="submit" variant="accent">Create {kind}</Button></div></form></div>;
}

function List({ title, items }: { title: string; items: string[] }) { return <div className="rounded-lg border p-4"><h3 className="font-medium">{title}</h3><div className="mt-3 space-y-2">{items.map((item) => <p className="text-sm text-muted-foreground" key={item}>{item}</p>)}{items.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}</div></div>; }

