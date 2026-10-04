import { ChartNoAxesCombined, Check, CircleCheck, CircleX, ClipboardCheck, Database, DatabaseBackup, FileText, HandCoins, History, ImageIcon, LayoutDashboard, Lock, LogOut, MapPinned, Menu, Monitor, MonitorCog, Moon, PanelLeftClose, PanelLeftOpen, ReceiptText, RefreshCw, ScrollText, Server, Shield, ShieldCheck, Sun, UserCog, Users, WalletCards, Wifi, X, type LucideIcon } from "lucide-react";
import { DropdownMenu, Tooltip } from "radix-ui";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { SecurityAdminPanel } from "@/features/admin/SecurityAdminPanel";
import { AuditPanel } from "@/features/audit/AuditPanel";
import { ChangePasswordScreen } from "@/features/auth/ChangePasswordScreen";
import { LockScreen } from "@/features/auth/LockScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { BackupPanel } from "@/features/backups/BackupPanel";
import { BillingPanel } from "@/features/billing/BillingPanel";
import { InvoicesPanel } from "@/features/billing/InvoicesPanel";
import { CollectionBatchesPanel } from "@/features/collections/CollectionBatchesPanel";
import { CollectionSetupPanel } from "@/features/collections/CollectionSetupPanel";
import { DashboardOverview } from "@/features/dashboard/DashboardOverview";
import { PaymentHistoryPanel } from "@/features/payments/PaymentHistoryPanel";
import { PaymentPanel } from "@/features/payments/PaymentPanel";
import { GcashReviewPanel } from "@/features/payments/GcashReviewPanel";
import { GcashSubmitPanel } from "@/features/payments/GcashSubmitPanel";
import { ReceivablesPanel } from "@/features/receivables/ReceivablesPanel";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { WorkspaceSearch, type SearchTarget } from "@/features/search/WorkspaceSearch";
import { PlansPanel } from "@/features/services/PlansPanel";
import { SubscriberPanel } from "@/features/subscribers/SubscriberPanel";
import { getCurrentUser, getHealthState, lockSession, logout, setSessionFailureHandler, type HealthState, type LoginResult } from "@/lib/api-client";
import { clearPrivateQueries } from "@/lib/query-client";
import { lockSessionBoundary } from "@/lib/session-boundary";

const initialHealth: HealthState = { api: "checking", database: "checking" };
type View = "dashboard" | "subscribers" | "plans" | "billing" | "invoices" | "payments" | "paymentHistory" | "gcashSubmit" | "gcashProofs" | "receivables" | "reports" | "audit" | "backups" | "collections" | "batches" | "users" | "roles";
type ThemePreference = "light" | "dark" | "system";

const sidebarPreferenceKey = "bcis-sidebar-collapsed-v1";
const themePreferenceKey = "bcis-theme-v1";

export function App() {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    async function refreshIdentity(token: string) {
      try {
        const user = await getCurrentUser(token);
        const current = sessionRef.current;
        if (!current || current.token !== token) return;
        if (JSON.stringify(current.user) !== JSON.stringify(user)) {
          clearPrivateQueries();
          setSession({ ...current, user });
        }
      } catch {
        // The API client handles revoked and locked sessions. Network failure is not logout.
      }
    }
    setSessionFailureHandler((token, error) => {
      if (sessionRef.current?.token !== token) return;
      if (error.code === "AUTHENTICATION_REQUIRED") {
        clearPrivateQueries(); setLocked(false); setSession(null);
      } else if (error.code === "SESSION_LOCKED") {
        clearPrivateQueries(); setLocked(true);
      } else if (error.status === 403) {
        void refreshIdentity(token);
      }
    });
    const onFocus = () => { if (sessionRef.current && !locked) void refreshIdentity(sessionRef.current.token); };
    window.addEventListener("focus", onFocus);
    return () => { setSessionFailureHandler(null); window.removeEventListener("focus", onFocus); };
  }, [locked]);

  useEffect(() => applyThemePreference(theme), [theme]);

  if (!session) return <LoginScreen onSuccess={(result) => { clearPrivateQueries(); setSession(result); }} />;
  const activeSession = session;

  async function signOut() {
    clearPrivateQueries();
    setLocked(false);
    setSession(null);
    try {
      await logout(activeSession.token);
    } catch { /* Local sign-out is final even when the server is unavailable. */ }
  }

  if (activeSession.user.mustChangePassword) {
    return <ChangePasswordScreen token={activeSession.token} onChanged={(user) => { clearPrivateQueries(); setSession({ ...activeSession, user }); }} onSignOut={() => void signOut()} />;
  }

  if (locked) {
    return <LockScreen token={activeSession.token} user={activeSession.user} onUnlocked={(user) => { clearPrivateQueries(); setSession({ ...activeSession, user }); setLocked(false); }} onSignOut={() => void signOut()} />;
  }

  return <FoundationDashboard key={`${activeSession.user.id}:${activeSession.user.roles.join(",")}:${activeSession.user.permissions.join(",")}`} session={activeSession} theme={theme} onThemeChange={setTheme} onLock={() => lockSessionBoundary(() => { clearPrivateQueries(); setLocked(true); }, () => lockSession(activeSession.token))} onSignOut={signOut} />;
}

function FoundationDashboard({ session, theme, onThemeChange, onLock, onSignOut }: { session: LoginResult; theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void; onLock: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [health, setHealth] = useState(initialHealth);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [searchTarget, setSearchTarget] = useState<(SearchTarget & { sequence: number }) | null>(null);
  const searchSequence = useRef(0);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readBooleanPreference(sidebarPreferenceKey));
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setHealth(initialHealth);
    setHealth(await getHealthState(signal));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    writePreference(sidebarPreferenceKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  function selectView(view: View) { setSearchTarget(null); setActiveView(view); }
  function openSearchTarget(target: SearchTarget) {
    searchSequence.current += 1;
    setSearchTarget({ ...target, sequence: searchSequence.current });
    setActiveView(target.kind === "subscriber" ? "subscribers" : target.kind === "invoice" ? "invoices" : "paymentHistory");
  }

  return <main className="min-h-screen bg-canvas text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-72"}`}>
      <SidebarContent activeView={activeView} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((value) => !value)} onLock={onLock} onSelect={selectView} onSignOut={onSignOut} session={session} />
    </aside>

    {mobileNavigationOpen && <MobileNavigation activeView={activeView} collapsed={false} onClose={() => setMobileNavigationOpen(false)} onLock={onLock} onSelect={selectView} onSignOut={onSignOut} session={session} triggerRef={navigationTriggerRef} />}

    <div className={`min-h-screen min-w-0 transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`} inert={mobileNavigationOpen}>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
        <Button className="lg:hidden" aria-controls="mobile-navigation" aria-expanded={mobileNavigationOpen} aria-label="Open navigation" onClick={() => setMobileNavigationOpen(true)} ref={navigationTriggerRef} size="icon" variant="outline"><Menu /></Button>
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm"><span className="text-muted-foreground">Home</span><span aria-hidden="true" className="px-2 text-muted-foreground/60">/</span><span className="inline-block max-w-[35vw] truncate align-bottom font-medium">{activeView === "dashboard" ? "Dashboard" : viewTitle(activeView)}</span></nav>
        <div className="ml-auto flex items-center gap-2">
          <WorkspaceSearch token={session.token} permissions={session.user.permissions} onOpen={openSearchTarget} />
          <span className="hidden max-w-52 truncate rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent sm:inline-flex">{session.user.roles[0] ?? "User"}</span>
          <ThemeMenu onChange={onThemeChange} value={theme} />
        </div>
      </header>

      {activeView === "dashboard" ? <Dashboard health={health} onRefresh={refresh} token={session.token} /> : <ModuleWorkspace key={`${activeView}:${searchTarget?.sequence ?? 0}`} onSignOut={onSignOut} searchTarget={searchTarget} session={session} view={activeView} />}
    </div>
  </main>;
}

function Dashboard({ health, onRefresh, token }: { health: HealthState; onRefresh: (signal?: AbortSignal) => Promise<void>; token: string }) {
  return <section className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-accent">Phase 10 release candidate</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Authenticated BCIS workspace</h1></div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success"><ShieldCheck className="size-3.5" /> Server session</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The server owns authentication and permissions. This desktop keeps the opaque session token only in memory.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2"><StatusCard icon={Server} label="Fastify API" state={health.api} /><StatusCard icon={Database} label="PostgreSQL" state={health.database} /></div>
      <Button className="mt-6" onClick={() => void onRefresh()} size="lg" variant="accent"><RefreshCw className="size-4" />Check connection</Button>
      <DashboardOverview token={token} />
    </div>
  </section>;
}

function ModuleWorkspace({ onSignOut, searchTarget, session, view }: { onSignOut: () => Promise<void>; searchTarget: SearchTarget | null; session: LoginResult; view: Exclude<View, "dashboard"> }) {
  const permissions = session.user.permissions;
  return <section className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
    <div className="mb-5"><p className="text-sm font-medium text-accent">BCIS workspace</p><h1 className="text-2xl font-semibold">{viewTitle(view)}</h1></div>
    {(view === "users" || view === "roles") && <SecurityAdminPanel mode={view} token={session.token} onSignOut={onSignOut} />}
    {view === "subscribers" && <SubscriberPanel token={session.token} openSubscriberId={searchTarget?.kind === "subscriber" ? searchTarget.id : undefined} canCreate={permissions.includes("subscriber.create")} canEdit={permissions.includes("subscriber.update")} canManageServices={permissions.includes("service.manage")} canManageCollections={permissions.includes("collection.manage_routes")} canViewReceivables={permissions.includes("receivable.view")} canViewReports={permissions.includes("report.view")} canExportReports={permissions.includes("report.export")} />}
    {view === "plans" && <PlansPanel token={session.token} canManage={permissions.includes("plan.manage")} />}
    {view === "billing" && <BillingPanel token={session.token} canGenerate={permissions.includes("billing.generate")} />}
    {view === "invoices" && <InvoicesPanel token={session.token} openInvoiceId={searchTarget?.kind === "invoice" ? searchTarget.id : undefined} canVoid={permissions.includes("billing.adjust")} />}
    {view === "payments" && <PaymentPanel token={session.token} canPrint={permissions.includes("receipt.print")} />}
    {view === "paymentHistory" && <PaymentHistoryPanel token={session.token} openPaymentId={searchTarget?.kind === "payment" ? searchTarget.id : undefined} canReverse={permissions.includes("payment.reverse")} canPrint={permissions.includes("receipt.print")} />}
    {view === "gcashSubmit" && <GcashSubmitPanel token={session.token} />}
    {view === "gcashProofs" && <GcashReviewPanel token={session.token} />}
    {view === "receivables" && <ReceivablesPanel token={session.token} canSuspend={permissions.includes("service.suspend")} canReconnect={permissions.includes("service.reconnect")} />}
    {view === "reports" && <ReportsPanel token={session.token} canExport={permissions.includes("report.export")} />}
    {view === "audit" && <AuditPanel token={session.token} />}
    {view === "backups" && <BackupPanel token={session.token} canRestore={permissions.includes("backup.restore")} onRestored={onSignOut} />}
    {view === "collections" && <CollectionSetupPanel token={session.token} />}
    {view === "batches" && <CollectionBatchesPanel token={session.token} canRecord={permissions.includes("collection.record")} canReconcile={permissions.includes("collection.reconcile")} />}
  </section>;
}

type SidebarContentProps = { activeView: View; collapsed: boolean; onCollapse?: () => void; onLock: () => Promise<void>; onSelect: (view: View) => void; onSignOut: () => Promise<void>; session: LoginResult };

function MobileNavigation({ onClose, triggerRef, ...sidebarProps }: SidebarContentProps & { onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeys);
      queueMicrotask(() => { if (!dialog?.isConnected && triggerRef.current?.isConnected && getComputedStyle(triggerRef.current).display !== "none") triggerRef.current.focus(); });
    };
  }, [triggerRef]);

  return <div className="fixed inset-0 z-50 lg:hidden">
    <button aria-hidden="true" className="absolute inset-0 bg-slate-950/55" onClick={onClose} tabIndex={-1} type="button" />
    <aside aria-label="Main navigation" aria-modal="true" className="relative flex h-full w-[min(18rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl" id="mobile-navigation" ref={dialogRef} role="dialog">
      <Button aria-label="Close navigation" className="absolute right-3 top-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={onClose} ref={closeButtonRef} size="icon" variant="ghost"><X /></Button>
      <SidebarContent {...sidebarProps} onSelect={(view) => { sidebarProps.onSelect(view); onClose(); }} />
    </aside>
  </div>;
}

function SidebarContent({ activeView, collapsed, onCollapse, onLock, onSelect, onSignOut, session }: SidebarContentProps) {
  const permissions = session.user.permissions;
  const items: Array<{ icon: LucideIcon; label: string; view: View; visible: boolean }> = [
    { icon: LayoutDashboard, label: "Dashboard", view: "dashboard", visible: true },
    { icon: Users, label: "Subscribers", view: "subscribers", visible: permissions.includes("subscriber.view") },
    { icon: Wifi, label: "Service plans", view: "plans", visible: permissions.includes("service.view") },
    { icon: ReceiptText, label: "Generate billing", view: "billing", visible: permissions.includes("billing.view") },
    { icon: FileText, label: "Invoices", view: "invoices", visible: permissions.includes("billing.view") },
    { icon: HandCoins, label: "Receive payment", view: "payments", visible: permissions.includes("payment.create") },
    { icon: History, label: "Payment history", view: "paymentHistory", visible: permissions.includes("billing.view") },
    { icon: ImageIcon, label: "Submit GCash proof", view: "gcashSubmit", visible: permissions.includes("payment.create") },
    { icon: ImageIcon, label: "GCash proofs", view: "gcashProofs", visible: permissions.includes("payment.verify_gcash") },
    { icon: WalletCards, label: "Receivables", view: "receivables", visible: permissions.includes("receivable.view") },
    { icon: MapPinned, label: "Collection setup", view: "collections", visible: permissions.includes("collection.manage_routes") },
    { icon: ClipboardCheck, label: "Collection batches", view: "batches", visible: permissions.includes("collection.manage_batch") },
    { icon: ChartNoAxesCombined, label: "Reports", view: "reports", visible: permissions.includes("report.view") },
    { icon: ScrollText, label: "Audit history", view: "audit", visible: permissions.includes("audit.view") },
    { icon: DatabaseBackup, label: "Backup and recovery", view: "backups", visible: permissions.includes("backup.create") },
    { icon: UserCog, label: "User accounts", view: "users", visible: permissions.includes("user.manage") },
    { icon: Shield, label: "Roles and permissions", view: "roles", visible: permissions.includes("role.manage") }
  ];
  const initials = session.user.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";

  return <>
    <div className={`flex min-h-16 items-center border-b border-sidebar-border ${collapsed ? "justify-center px-3" : "gap-3 px-4 pr-12"}`}>
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><MonitorCog aria-hidden="true" className="size-5" /></div>
      {!collapsed && <div className="min-w-0"><p className="font-semibold tracking-wide">BCIS</p><p className="truncate text-xs text-sidebar-foreground/70">Billing & Collection System</p></div>}
      {onCollapse && <Button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={`absolute right-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? "top-[4.5rem]" : "top-3"}`} onClick={onCollapse} size="icon" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} variant="ghost">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>}
    </div>
    <Tooltip.Provider delayDuration={250}>
      <nav aria-label="Main navigation" className={`min-h-0 flex-1 overflow-y-auto py-4 ${collapsed ? "px-2 pt-14" : "px-3"}`}>
        {!collapsed && <p className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">Workspace</p>}
        <div className="space-y-1">{items.filter((item) => item.visible).map((item) => <SidebarNavButton active={activeView === item.view} collapsed={collapsed} icon={item.icon} key={item.view} label={item.label} onClick={() => onSelect(item.view)} />)}</div>
      </nav>
    </Tooltip.Provider>
    <div className="border-t border-sidebar-border p-2">
      <div className={`rounded-lg bg-sidebar-accent/70 ${collapsed ? "space-y-1 p-1.5" : "p-3"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}><div aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">{initials}</div>{!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.user.displayName}</p><p className="truncate text-xs text-sidebar-foreground/60">{session.user.roles.join(", ")}</p></div>}</div>
        <div className={`mt-2 grid gap-1 ${collapsed ? "grid-cols-1" : "grid-cols-2"}`}><Button aria-label="Lock session" className="text-sidebar-foreground hover:bg-sidebar-border hover:text-sidebar-foreground" onClick={() => void onLock()} size={collapsed ? "icon" : "sm"} title="Lock session" variant="ghost"><Lock />{!collapsed && "Lock"}</Button><Button aria-label="Sign out" className="text-sidebar-foreground hover:bg-sidebar-border hover:text-sidebar-foreground" onClick={() => void onSignOut()} size={collapsed ? "icon" : "sm"} title="Sign out" variant="ghost"><LogOut />{!collapsed && "Sign out"}</Button></div>
      </div>
    </div>
  </>;
}

function SidebarNavButton({ active, collapsed, icon: Icon, label, onClick }: { active: boolean; collapsed: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  const button = <button aria-current={active ? "page" : undefined} aria-label={collapsed ? label : undefined} className={`flex min-h-10 w-full items-center rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring ${collapsed ? "justify-center px-2" : "gap-3 px-3 py-2 text-left"} ${active ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`} onClick={onClick} type="button"><Icon aria-hidden="true" className="size-4 shrink-0" />{!collapsed && <span>{label}</span>}</button>;
  if (!collapsed) return button;
  return <Tooltip.Root><Tooltip.Trigger asChild>{button}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="z-[70] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md" side="right" sideOffset={8}>{label}<Tooltip.Arrow className="fill-popover" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function ThemeMenu({ onChange, value }: { onChange: (theme: ThemePreference) => void; value: ThemePreference }) {
  const ThemeIcon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button aria-label={`Theme: ${value}`} size="icon" title="Appearance" variant="outline"><ThemeIcon /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-[80] min-w-40 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg" sideOffset={8}><DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Appearance</DropdownMenu.Label><DropdownMenu.RadioGroup onValueChange={(next) => onChange(next as ThemePreference)} value={value}>{([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([theme, Icon]) => <DropdownMenu.RadioItem className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none focus:bg-muted" key={theme} value={theme}><Icon className="size-4" /><span className="capitalize">{theme}</span><DropdownMenu.ItemIndicator className="ml-auto"><Check className="size-4" /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

function readBooleanPreference(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themePreferenceKey);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences are optional; the application remains usable if storage is unavailable.
  }
}

function applyThemePreference(theme: ThemePreference): () => void {
  writePreference(themePreferenceKey, theme);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
  apply();
  if (theme !== "system") return () => undefined;
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}

function viewTitle(view: Exclude<View, "dashboard">) {
  return { subscribers: "Subscribers and service accounts", plans: "Service plans", billing: "Generate monthly billing", invoices: "Invoices", payments: "Receive payment", paymentHistory: "Payment history", gcashSubmit: "Submit GCash proof", gcashProofs: "GCash proofs", receivables: "Receivables and service control", reports: "Reports and exports", audit: "Business audit history", backups: "Backup and recovery", collections: "Collection setup", batches: "Collection batches", users: "User accounts", roles: "Roles and permissions" }[view];
}

function StatusCard({ icon: Icon, label, state }: { icon: typeof Server; label: string; state: HealthState[keyof HealthState] }) {
  const positive = state === "online" || state === "ready";
  const checking = state === "checking";
  const StateIcon = positive ? CircleCheck : CircleX;
  return <div className="flex items-center gap-3 rounded-lg border border-border p-4"><Icon className="size-5 text-muted-foreground" /><div><p className="text-sm font-medium">{label}</p><p className="text-xs capitalize text-muted-foreground">{state}</p></div>{!checking && <StateIcon aria-label={positive ? "Available" : "Unavailable"} className={`ml-auto size-5 ${positive ? "text-success" : "text-danger"}`} />}</div>;
}
