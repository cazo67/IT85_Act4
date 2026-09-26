import { CircleCheck, CircleX, Database, Lock, LogOut, MonitorCog, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LockScreen } from "@/features/auth/LockScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { ChangePasswordScreen } from "@/features/auth/ChangePasswordScreen";
import { SecurityAdminPanel } from "@/features/admin/SecurityAdminPanel";
import { CollectionSetupPanel } from "@/features/collections/CollectionSetupPanel";
import { CollectionBatchesPanel } from "@/features/collections/CollectionBatchesPanel";
import { BillingPanel } from "@/features/billing/BillingPanel";
import { InvoicesPanel } from "@/features/billing/InvoicesPanel";
import { PaymentPanel } from "@/features/payments/PaymentPanel";
import { PaymentHistoryPanel } from "@/features/payments/PaymentHistoryPanel";
import { ReceivablesPanel } from "@/features/receivables/ReceivablesPanel";
import { DashboardOverview } from "@/features/dashboard/DashboardOverview";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { BackupPanel } from "@/features/backups/BackupPanel";
import { AuditPanel } from "@/features/audit/AuditPanel";
import { PlansPanel } from "@/features/services/PlansPanel";
import { SubscriberPanel } from "@/features/subscribers/SubscriberPanel";
import { getHealthState, lockSession, logout, type HealthState, type LoginResult } from "@/lib/api-client";

const initialHealth: HealthState = { api: "checking", database: "checking" };

export function App() {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [locked, setLocked] = useState(false);

  if (!session) return <LoginScreen onSuccess={setSession} />;
  const activeSession = session;

  async function signOut() {
    try {
      await logout(activeSession.token);
    } finally {
      setLocked(false);
      setSession(null);
    }
  }

  if (activeSession.user.mustChangePassword) {
    return <ChangePasswordScreen token={activeSession.token} onChanged={(user) => setSession({ ...activeSession, user })} onSignOut={() => void signOut()} />;
  }

  if (locked) {
    return <LockScreen token={activeSession.token} user={activeSession.user} onUnlocked={(user) => { setSession({ ...activeSession, user }); setLocked(false); }} onSignOut={() => void signOut()} />;
  }

  return (
    <FoundationDashboard
      session={activeSession}
      onLock={async () => { await lockSession(activeSession.token); setLocked(true); }}
      onSignOut={signOut}
    />
  );
}

function FoundationDashboard({ session, onLock, onSignOut }: { session: LoginResult; onLock: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [health, setHealth] = useState(initialHealth);
  const [activeView, setActiveView] = useState<"dashboard" | "subscribers" | "plans" | "billing" | "invoices" | "payments" | "paymentHistory" | "receivables" | "reports" | "audit" | "backups" | "collections" | "batches" | "users" | "roles">("dashboard");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setHealth(initialHealth);
    setHealth(await getHealthState(signal));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const canManageUsers = session.user.permissions.includes("user.manage");

  return (
    <main className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-6">
          <div className="grid size-9 place-items-center rounded-lg bg-white/10"><MonitorCog aria-hidden="true" className="size-5" /></div>
          <div><p className="text-sm font-semibold tracking-wide">BCIS</p><p className="text-xs text-white/70">Subscription Billing and Collection System</p></div>
          <div className="ml-auto text-right"><p className="text-sm font-medium">{session.user.displayName}</p><p className="text-xs text-white/70">{session.user.roles.join(", ")}</p></div>
          <Button aria-label="Lock session" onClick={() => void onLock()} size="icon" variant="ghost"><Lock /></Button>
          <Button aria-label="Sign out" onClick={() => void onSignOut()} size="icon" variant="ghost"><LogOut /></Button>
        </div>
      </header>

      {activeView === "dashboard" ? <section className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-border bg-surface p-7 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-medium text-accent">Phase 10 release candidate</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Authenticated BCIS workspace</h1></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success"><ShieldCheck className="size-3.5" /> Server session</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The server owns authentication and permissions. This desktop keeps the opaque session token only in memory.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2"><StatusCard icon={Server} label="Fastify API" state={health.api} /><StatusCard icon={Database} label="PostgreSQL" state={health.database} /></div>
          <Button className="mt-6" onClick={() => void refresh()} size="lg" variant="accent"><RefreshCw className="size-4" />Check connection</Button>
          <DashboardOverview token={session.token} />
        </div>

        <aside className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="font-semibold">Permission-aware navigation</h2>
          <nav className="mt-4 space-y-2 text-sm">
            <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("dashboard")}>Dashboard</button>
            {session.user.permissions.includes("subscriber.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("subscribers")}>Subscribers</button>}
            {session.user.permissions.includes("billing.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("billing")}>Generate billing</button>}
            {session.user.permissions.includes("billing.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("invoices")}>Invoices</button>}
            {session.user.permissions.includes("payment.create") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("payments")}>Receive payment</button>}
            {session.user.permissions.includes("billing.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("paymentHistory")}>Payment history</button>}
            {session.user.permissions.includes("receivable.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("receivables")}>Receivables · Service control</button>}
            {session.user.permissions.includes("report.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("reports")}>Reports · PDF/XLSX</button>}
            {session.user.permissions.includes("backup.create") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("backups")}>Administration · Backup</button>}
            {session.user.permissions.includes("audit.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("audit")}>Administration · Audit</button>}
            {session.user.permissions.includes("collection.manage_batch") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("batches")}>Collection batches</button>}
            {session.user.permissions.includes("service.view") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("plans")}>Services · Plans</button>}
            {session.user.permissions.includes("collection.manage_routes") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("collections")}>Collections · Setup</button>}
            {canManageUsers && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("users")}>Administration · Users</button>}
            {session.user.permissions.includes("role.manage") && <button className="block w-full rounded-md bg-muted px-3 py-2 text-left" onClick={() => setActiveView("roles")}>Administration · Roles</button>}
          </nav>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">Hidden navigation is only a convenience. Fastify independently rejects unauthorized direct API requests.</p>
        </aside>
      </section> : <section className="mx-auto max-w-6xl px-6 py-10"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-medium text-accent">BCIS workspace</p><h1 className="text-2xl font-semibold">{viewTitle(activeView)}</h1></div><Button onClick={() => setActiveView("dashboard")} variant="outline">Back to dashboard</Button></div>{(activeView === "users" || activeView === "roles") && <SecurityAdminPanel mode={activeView} token={session.token} />}{activeView === "subscribers" && <SubscriberPanel token={session.token} canCreate={session.user.permissions.includes("subscriber.create")} canManageServices={session.user.permissions.includes("service.manage")} canManageCollections={session.user.permissions.includes("collection.manage_routes")} canViewReceivables={session.user.permissions.includes("receivable.view")} />}{activeView === "plans" && <PlansPanel token={session.token} canManage={session.user.permissions.includes("plan.manage")} />}{activeView === "billing" && <BillingPanel token={session.token} canGenerate={session.user.permissions.includes("billing.generate")} />}{activeView === "invoices" && <InvoicesPanel token={session.token} />}{activeView === "payments" && <PaymentPanel token={session.token} canPrint={session.user.permissions.includes("receipt.print")} />}{activeView === "paymentHistory" && <PaymentHistoryPanel token={session.token} canReverse={session.user.permissions.includes("payment.reverse")} />}{activeView === "receivables" && <ReceivablesPanel token={session.token} canSuspend={session.user.permissions.includes("service.suspend")} canReconnect={session.user.permissions.includes("service.reconnect")} />}{activeView === "reports" && <ReportsPanel token={session.token} canExport={session.user.permissions.includes("report.export")} />}{activeView === "audit" && <AuditPanel token={session.token} />}{activeView === "backups" && <BackupPanel token={session.token} canRestore={session.user.permissions.includes("backup.restore")} onRestored={onSignOut} />}{activeView === "collections" && <CollectionSetupPanel token={session.token} />}{activeView === "batches" && <CollectionBatchesPanel token={session.token} canRecord={session.user.permissions.includes("collection.record")} canReconcile={session.user.permissions.includes("collection.reconcile")} />}</section>}
    </main>
  );
}

function viewTitle(view: "subscribers" | "plans" | "billing" | "invoices" | "payments" | "paymentHistory" | "receivables" | "reports" | "audit" | "backups" | "collections" | "batches" | "users" | "roles") {
  return { subscribers: "Subscribers and service accounts", plans: "Service plans", billing: "Generate monthly billing", invoices: "Invoices", payments: "Receive payment", paymentHistory: "Payment history", receivables: "Receivables and service control", reports: "Reports and exports", audit: "Business audit history", backups: "Backup and recovery", collections: "Collection setup", batches: "Collection batches", users: "User accounts", roles: "Roles and permissions" }[view];
}

function StatusCard({ icon: Icon, label, state }: { icon: typeof Server; label: string; state: HealthState[keyof HealthState] }) {
  const positive = state === "online" || state === "ready";
  const checking = state === "checking";
  const StateIcon = positive ? CircleCheck : CircleX;
  return <div className="flex items-center gap-3 rounded-lg border border-border p-4"><Icon className="size-5 text-muted-foreground" /><div><p className="text-sm font-medium">{label}</p><p className="text-xs capitalize text-muted-foreground">{state}</p></div>{!checking && <StateIcon aria-label={positive ? "Available" : "Unavailable"} className={`ml-auto size-5 ${positive ? "text-success" : "text-danger"}`} />}</div>;
}
