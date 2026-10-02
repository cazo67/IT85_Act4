const apiBaseUrl = import.meta.env.VITE_BCIS_API_BASE_URL ?? "http://127.0.0.1:4100";

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export interface SecurityUser {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  version: number;
  roles: string[];
}

export interface SecurityRole {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface SubscriberListItem {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  status: string;
  billingDay: number;
  dueDay: number;
}

export interface ServicePlan {
  id: string;
  code: string;
  name: string;
  description: string;
  priceCentavos: string;
  installationFeeCentavos: string;
  reconnectionFeeCentavos: string;
  internetSpeedMbps: number | null;
  cableChannelCount: number | null;
  isActive: boolean;
  serviceTypeId: string;
  version: number;
}

export interface SubscriberProfileData {
  subscriber: SubscriberListItem & Record<string, unknown>;
  addresses: Array<{ id: string; type: "BILLING" | "SERVICE" | "MAILING" | "OTHER"; label: string; line1: string; line2: string | null; barangay: string; cityMunicipality: string; province: string; postalCode: string | null; isPrimary: boolean; isActive: boolean }>;
  contacts: Array<{ id: string; type: "MOBILE" | "PHONE" | "EMAIL" | "OTHER"; value: string; isPrimary: boolean; isActive: boolean }>;
  services: Array<{ account: { id: string; serviceAccountNumber: string; planId: string; installationAddressId: string; currentRateCentavos: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISCONNECTED" | "TERMINATED"; version: number }; planName: string; planCode: string }>;
  serviceHistory: Array<Record<string, unknown>>;
}

export interface CollectionSetup {
  areas: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  routes: Array<{ id: string; areaId: string; code: string; name: string; isActive: boolean }>;
  collectors: Array<{ id: string; code: string; displayName: string; contactNumber: string | null; isActive: boolean }>;
}

export interface CollectorAssignmentHistoryItem {
  id: string;
  collectorId: string;
  collectorName: string;
  routeId: string | null;
  routeName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface BillingPreview {
  period: { key: string; start: string; end: string; invoiceDate: string };
  cycleStatus: "DRAFT" | "FINALIZED" | null;
  eligibleCount: number;
  pendingCount: number;
  totalCentavos: string;
  items: Array<{ serviceAccountId: string; serviceAccountNumber: string; subscriberId: string; subscriberName: string; planCode: string; planName: string; amountCentavos: string; dueDate: string; alreadyBilled: boolean }>;
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  subscriberId: string;
  serviceAccountId: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  subtotalCentavos: string;
  totalCentavos: string;
  paidCentavos: string;
  outstandingCentavos: string;
  planNameSnapshot: string;
  planCodeSnapshot: string;
  subscriberAccountNumber: string;
  subscriberName: string;
  serviceAccountNumber: string;
}

export interface InvoiceDetail {
  invoice: InvoiceListItem;
  items: Array<{ id: string; type: "PLAN_SERVICE" | "ADJUSTMENT"; description: string; quantity: number; unitAmountCentavos: string; totalCentavos: string }>;
}

export interface PaymentPreview {
  subscriber: { id: string; accountNumber: string; firstName: string; lastName: string };
  amountCentavos: string;
  outstandingCentavos: string;
  unallocatedCentavos: string;
  overpaymentBlocked: boolean;
  allocations: Array<{ invoiceId: string; invoiceNumber: string; amountCentavos: string }>;
}

export interface PaymentResult {
  payment: { id: string; paymentNumber: string; subscriberId: string; method: string; amountCentavos: string; status: string; paidAt: string };
  receipt: { receiptNumber: string; snapshot: Record<string, unknown>; voidedAt: string | null } | null;
  allocations: Array<{ invoiceNumber: string; amountCentavos: string; isReversed?: boolean }>;
}

export interface CollectionBatch {
  id: string;
  batchNumber: string;
  collectorId: string;
  routeId: string;
  collectionDate: string;
  status: "DRAFT" | "ACTIVE" | "SUBMITTED" | "REMITTED" | "RECONCILED" | "CLOSED";
  expectedCashCentavos: string;
  collectedCashCentavos: string;
  nonCashCentavos: string;
  remittedCashCentavos: string;
  differenceCentavos: string;
  version: number;
}

export interface CollectionBatchDetail {
  batch: CollectionBatch;
  summary: { accountCount: number; pendingCount: number; partialCount: number; collectedCount: number; uncollectedCentavos: string; totalsMatch: boolean };
  accounts: Array<{ id: string; accountNumberSnapshot: string; subscriberNameSnapshot: string; serviceNumberSnapshot: string; addressSnapshot: string | null; currentBillCentavosSnapshot: string | null; arrearsCentavosSnapshot: string | null; expectedCentavos: string; collectedCentavos: string; status: string }>;
  entries: Array<{ id: string; amountCentavos: string }>;
  remittance: null | { remittanceNumber: string; remittedCashCentavos: string; differenceCentavos: string; notes: string };
  reconciliation: null | { differenceCentavos: string; notes: string };
}

export interface ReceivableItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalCentavos: string;
  paidCentavos: string;
  remainingCentavos: string;
  subscriberId: string;
  accountNumber: string;
  subscriberName: string;
  serviceAccountId: string;
  serviceAccountNumber: string;
  serviceStatus: string;
  planCode: string;
  planName: string;
  serviceTypeCode: string;
  serviceTypeName: string;
  areaName: string | null;
  collectorName: string | null;
  daysPastDue: number;
  ageBucket: "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
  lastPaymentAt: string | null;
}

export interface ReceivableFilters {
  search?: string;
  bucket?: ReceivableItem["ageBucket"];
  areaId?: string;
  collectorId?: string;
  planId?: string;
  serviceTypeId?: string;
}

export interface OverdueAccountItem {
  subscriberId: string;
  accountNumber: string;
  subscriberName: string;
  serviceAccountId: string;
  serviceAccountNumber: string;
  serviceStatus: string;
  areaName: string | null;
  collectorName: string | null;
  monthsUnpaid: number;
  overdueInvoiceCount: number;
  oldestUnpaidInvoice: string;
  oldestDueDate: string;
  maximumDaysPastDue: number;
  totalArrearsCentavos: string;
  lastPaymentAt: string | null;
}

export interface ReceivableFilterOptions {
  areas: Array<{ id: string; name: string }>;
  collectors: Array<{ id: string; name: string }>;
  plans: Array<{ id: string; name: string; code: string }>;
  serviceTypes: Array<{ id: string; name: string; code: string }>;
}

export interface AgingSummary {
  asOf: string;
  currentCentavos: string;
  days1To30Centavos: string;
  days31To60Centavos: string;
  days61To90Centavos: string;
  days91PlusCentavos: string;
  totalCentavos: string;
  invoiceCount: number;
}

export interface SuspensionCandidate {
  serviceAccountId: string;
  serviceAccountNumber: string;
  subscriberId: string;
  accountNumber: string;
  subscriberName: string;
  oldestDueDate: string;
  maximumDaysPastDue: number;
  overdueCentavos: string;
}

export interface ServiceControlRecord {
  id: string;
  serviceAccountId: string;
  status: "REQUESTED" | "APPROVED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  reason: string;
  decisionNotes: string;
  version: number;
  requestedAt: string;
  qualifyingPaymentId?: string | null;
  outstandingCentavosSnapshot?: string;
}

export interface ServiceControlList {
  suspensions: Array<{ record: ServiceControlRecord; serviceAccountNumber: string; accountNumber: string; subscriberName: string }>;
  reconnections: Array<{ record: ServiceControlRecord; serviceAccountNumber: string; accountNumber: string; subscriberName: string }>;
}

export interface DashboardData {
  asOf: string;
  monthStart: string;
  billedCentavos: string;
  billedInvoiceCount: number;
  collectedCentavos: string;
  paymentCount: number;
  outstandingCentavos: string;
  outstandingInvoiceCount: number;
  activeServiceCount: number;
  suspendedServiceCount: number;
  openBatchCount: number;
  aging: AgingSummary;
  paymentMethods: Array<{ method: "CASH" | "GCASH"; amountCentavos: string; paymentCount: number }>;
  collectorPerformance: Array<{ collectorId: string; collectorName: string; batchCount: number; expectedCentavos: string; collectedCentavos: string; remittedCentavos: string }>;
  overdueAlerts: Array<{ subscriberId: string; accountNumber: string; subscriberName: string; serviceAccountNumber: string; oldestDueDate: string; maximumDaysPastDue: number; totalArrearsCentavos: string }>;
  hasMoreOverdue: boolean;
  recentPayments: Array<{ paymentNumber: string; paidAt: string; method: "CASH" | "GCASH"; amountCentavos: string; accountNumber: string; subscriberName: string }>;
}

export interface ReportDocument {
  code: string;
  title: string;
  parameters: Record<string, string>;
  generatedAt: string;
  generatedBy: string;
  columns: Array<{ key: string; label: string; type: "text" | "date" | "integer" | "money"; width?: number }>;
  rows: Array<Record<string, string | number>>;
  summary: Array<{ label: string; value: string | number; type: "text" | "date" | "integer" | "money" }>;
}

export interface BackupRun {
  id: string;
  status: "RUNNING" | "CREATED" | "VERIFIED" | "FAILED" | "RESTORED";
  sizeBytes: string | null;
  sha256: string | null;
  verificationMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  restoredAt: string | null;
}

export interface AuditLogItem {
  log: { id: string; action: string; entityType: string; entityId: string | null; reason: string | null; requestId: string | null; beforeValues: unknown; afterValues: unknown; occurredAt: string };
  actorDisplayName: string | null;
  actorUsername: string | null;
}

export interface HealthState {
  api: "checking" | "online" | "offline";
  database: "checking" | "ready" | "unavailable";
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

let sessionFailureHandler: ((token: string, error: ApiError) => void) | null = null;

export function setSessionFailureHandler(handler: ((token: string, error: ApiError) => void) | null): void {
  sessionFailureHandler = handler;
}

export function getCurrentUser(token: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>("/api/v1/auth/me", { method: "GET" }, token);
}

export async function login(username: string, password: string): Promise<LoginResult> {
  return request<LoginResult>("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

export function lockSession(token: string): Promise<void> {
  return request<void>("/api/v1/auth/lock", { method: "POST" }, token);
}

export function unlockSession(token: string, password: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>("/api/v1/auth/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  }, token);
}

export function logout(token: string): Promise<void> {
  return request<void>("/api/v1/auth/logout", { method: "POST" }, token);
}

export function changePassword(token: string, currentPassword: string, newPassword: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>("/api/v1/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }, token);
}

export function listUsers(token: string): Promise<SecurityUser[]> {
  return request<SecurityUser[]>("/api/v1/users", { method: "GET" }, token);
}

export function listRoles(token: string): Promise<SecurityRole[]> {
  return request<SecurityRole[]>("/api/v1/roles", { method: "GET" }, token);
}

export function createUser(token: string, input: { username: string; displayName: string; password: string; roles: string[] }): Promise<SecurityUser> {
  return request<SecurityUser>("/api/v1/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, token);
}

export function setUserActive(token: string, userId: string, isActive: boolean): Promise<void> {
  return request<void>(`/api/v1/users/${userId}/active`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive }) }, token);
}

export function setRolePermissions(token: string, roleId: string, permissions: string[]): Promise<void> {
  return request<void>(`/api/v1/roles/${roleId}/permissions`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions }) }, token);
}

export function listSubscribers(token: string, search = "", page = 1) {
  return request<{ items: SubscriberListItem[]; page: number; pageSize: number; hasMore: boolean }>(`/api/v1/subscribers?search=${encodeURIComponent(search)}&page=${page}&pageSize=25`, { method: "GET" }, token);
}

export function createSubscriber(token: string, input: unknown): Promise<{ id: string; accountNumber: string }> {
  return request("/api/v1/subscribers", jsonRequest("POST", input), token);
}

export function getSubscriber(token: string, id: string): Promise<SubscriberProfileData> {
  return request(`/api/v1/subscribers/${id}`, { method: "GET" }, token);
}

export function updateSubscriberIdentity(token: string, id: string, input: { firstName: string; middleName: string; lastName: string; suffix: string; version: number }): Promise<void> {
  return request(`/api/v1/subscribers/${id}/identity`, jsonRequest("PATCH", input), token);
}

export function updateSubscriberStatus(token: string, id: string, input: { status: "INACTIVE"; billingDay: number; dueDay: number; notes: string; version: number; collectionAreaId?: string; assignedCollectorId?: string }): Promise<void> {
  return request(`/api/v1/subscribers/${id}`, jsonRequest("PATCH", input), token);
}

export function addSubscriberContact(token: string, id: string, input: { type: "MOBILE" | "PHONE" | "EMAIL" | "OTHER"; value: string; isPrimary: boolean; version: number }): Promise<{ id: string }> {
  return request(`/api/v1/subscribers/${id}/contacts`, jsonRequest("POST", input), token);
}

export function replaceSubscriberContact(token: string, id: string, contactId: string, input: { type: "MOBILE" | "PHONE" | "EMAIL" | "OTHER"; value: string; isPrimary: boolean; version: number }): Promise<{ id: string }> {
  return request(`/api/v1/subscribers/${id}/contacts/${contactId}`, jsonRequest("PUT", input), token);
}

export function deactivateSubscriberContact(token: string, id: string, contactId: string, version: number): Promise<void> {
  return request(`/api/v1/subscribers/${id}/contacts/${contactId}/active`, jsonRequest("PATCH", { version }), token);
}

export function addSubscriberAddress(token: string, id: string, input: { type: "BILLING" | "SERVICE" | "MAILING" | "OTHER"; label?: string; line1: string; line2?: string; barangay: string; cityMunicipality: string; province: string; postalCode?: string; isPrimary: boolean; version: number }): Promise<{ id: string }> {
  return request(`/api/v1/subscribers/${id}/addresses`, jsonRequest("POST", input), token);
}

export function replaceSubscriberAddress(token: string, id: string, addressId: string, input: { type: "BILLING" | "SERVICE" | "MAILING" | "OTHER"; label?: string; line1: string; line2?: string; barangay: string; cityMunicipality: string; province: string; postalCode?: string; isPrimary: boolean; version: number }): Promise<{ id: string }> {
  return request(`/api/v1/subscribers/${id}/addresses/${addressId}`, jsonRequest("PUT", input), token);
}

export function deactivateSubscriberAddress(token: string, id: string, addressId: string, version: number): Promise<void> {
  return request(`/api/v1/subscribers/${id}/addresses/${addressId}/active`, jsonRequest("PATCH", { version }), token);
}

export function listPlans(token: string, includeInactive = false): Promise<Array<{ plan: ServicePlan; serviceTypeCode: string; serviceTypeName: string }>> {
  return request(`/api/v1/plans?includeInactive=${includeInactive}`, { method: "GET" }, token);
}

export function listServiceTypes(token: string): Promise<Array<{ id: string; code: string; name: string }>> {
  return request("/api/v1/service-types", { method: "GET" }, token);
}

export function createPlan(token: string, input: unknown): Promise<ServicePlan> {
  return request("/api/v1/plans", jsonRequest("POST", input), token);
}

export function updatePlan(token: string, planId: string, input: { name: string; description: string; priceCentavos: string; installationFeeCentavos: string; reconnectionFeeCentavos: string; version: number }): Promise<ServicePlan> {
  return request(`/api/v1/plans/${planId}`, jsonRequest("PUT", input), token);
}

export function setPlanActive(token: string, planId: string, isActive: boolean, version?: number): Promise<void> {
  return request(`/api/v1/plans/${planId}/active`, jsonRequest("PATCH", { isActive, version }), token);
}

export function createServiceAccount(token: string, input: unknown): Promise<Record<string, unknown>> {
  return request("/api/v1/service-accounts", jsonRequest("POST", input), token);
}

export function updateServiceAccountDetails(token: string, id: string, input: { planId: string; installationAddressId: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISCONNECTED" | "TERMINATED"; reason: string; version: number }): Promise<void> {
  return request(`/api/v1/service-accounts/${id}`, jsonRequest("PATCH", input), token);
}

export function getCollectionSetup(token: string): Promise<CollectionSetup> {
  return request("/api/v1/collection-setup", { method: "GET" }, token);
}

export function createCollectionArea(token: string, input: unknown) {
  return request("/api/v1/collection-areas", jsonRequest("POST", input), token);
}

export function createCollectionRoute(token: string, input: unknown) {
  return request("/api/v1/collection-routes", jsonRequest("POST", input), token);
}

export function createCollector(token: string, input: unknown) {
  return request("/api/v1/collectors", jsonRequest("POST", input), token);
}

export function assignCollector(token: string, input: unknown) {
  return request("/api/v1/collector-assignments", jsonRequest("POST", input), token);
}

export function listCollectorAssignments(token: string, serviceAccountId: string): Promise<CollectorAssignmentHistoryItem[]> {
  return request(`/api/v1/service-accounts/${serviceAccountId}/collector-assignments`, { method: "GET" }, token);
}

export function getBillingPreview(token: string, periodKey: string): Promise<BillingPreview> {
  return request(`/api/v1/billing/preview?periodKey=${encodeURIComponent(periodKey)}`, { method: "GET" }, token);
}

export function finalizeBilling(token: string, periodKey: string, commandKey: string): Promise<{ cycleId: string; periodKey: string; invoiceCount: number; totalCentavos: string; alreadyFinalized: boolean }> {
  return request("/api/v1/billing/finalize", jsonRequest("POST", { periodKey, commandKey }), token);
}

export function listInvoices(token: string, periodKey = "", page = 1, invoiceNumber = ""): Promise<{ items: InvoiceListItem[]; page: number; pageSize: number; hasMore: boolean }> {
  const period = periodKey ? `&periodKey=${encodeURIComponent(periodKey)}` : "";
  const search = invoiceNumber ? `&invoiceNumber=${encodeURIComponent(invoiceNumber)}` : "";
  return request(`/api/v1/invoices?page=${page}&pageSize=50${period}${search}`, { method: "GET" }, token);
}

export function getInvoice(token: string, invoiceId: string): Promise<InvoiceDetail> {
  return request(`/api/v1/invoices/${invoiceId}`, { method: "GET" }, token);
}

export function getStatement(token: string, subscriberId: string): Promise<{ entries: Array<Record<string, unknown>>; closingBalanceCentavos: string }> {
  return request(`/api/v1/subscribers/${subscriberId}/statement`, { method: "GET" }, token);
}

export interface LedgerPage {
  subscriber: { id: string; accountNumber: string; firstName: string; lastName: string };
  entries: Array<{ id: string; sequenceNumber: string; type: string; description: string; occurredAt: string; invoiceId: string | null; paymentId: string | null; debitCentavos: string; creditCentavos: string; balanceCentavos: string }>;
  dateFrom: string | null;
  dateTo: string | null;
  openingBalanceCentavos: string;
  pageOpeningBalanceCentavos: string;
  closingBalanceCentavos: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function getLedger(token: string, subscriberId: string, page = 1, dateFrom?: string, dateTo?: string): Promise<LedgerPage> {
  return request(`/api/v1/subscribers/${subscriberId}/ledger?${new URLSearchParams({ page: String(page), pageSize: "50", ...(dateFrom && dateTo ? { dateFrom, dateTo } : {}) })}`, { method: "GET" }, token);
}

export function getPaymentPreview(token: string, subscriberId: string, amountCentavos: string): Promise<PaymentPreview> {
  return request(`/api/v1/payments/preview?subscriberId=${encodeURIComponent(subscriberId)}&amountCentavos=${encodeURIComponent(amountCentavos)}`, { method: "GET" }, token);
}

export function postPayment(token: string, input: { subscriberId: string; amountCentavos: string; method: "CASH"; commandKey: string }): Promise<PaymentResult> {
  return request("/api/v1/payments", jsonRequest("POST", input), token);
}

export function listPayments(token: string, page = 1, subscriberId?: string): Promise<{ items: Array<{ payment: PaymentResult["payment"]; receiptNumber: string | null }>; page: number; pageSize: number; hasMore: boolean }> {
  return request(`/api/v1/payments?${new URLSearchParams({ page: String(page), pageSize: "50", ...(subscriberId ? { subscriberId } : {}) })}`, { method: "GET" }, token);
}

export function getPayment(token: string, paymentId: string): Promise<PaymentResult> {
  return request(`/api/v1/payments/${paymentId}`, { method: "GET" }, token);
}

export function reversePayment(token: string, paymentId: string, reason: string) {
  return request(`/api/v1/payments/${paymentId}/reverse`, jsonRequest("POST", { reason }), token);
}

export function listCollectionBatches(token: string): Promise<Array<{ batch: CollectionBatch; collectorName: string; routeName: string }>> {
  return request("/api/v1/collection-batches", { method: "GET" }, token);
}

export function createCollectionBatch(token: string, input: { collectorId: string; routeId: string; collectionDate: string }): Promise<CollectionBatch> {
  return request("/api/v1/collection-batches", jsonRequest("POST", input), token);
}

export function getCollectionBatch(token: string, batchId: string): Promise<CollectionBatchDetail> {
  return request(`/api/v1/collection-batches/${batchId}`, { method: "GET" }, token);
}

export function transitionCollectionBatch(token: string, batchId: string, action: "start" | "submit" | "close", version: number): Promise<void> {
  return request(`/api/v1/collection-batches/${batchId}/${action}`, jsonRequest("POST", { version }), token);
}

export function recordBatchCollection(token: string, batchId: string, input: { batchAccountId: string; amountCentavos: string; commandKey: string }): Promise<PaymentResult> {
  return request(`/api/v1/collection-batches/${batchId}/collections`, jsonRequest("POST", input), token);
}

export function remitCollectionBatch(token: string, batchId: string, input: { remittedCashCentavos: string; notes: string; version: number }) {
  return request(`/api/v1/collection-batches/${batchId}/remittance`, jsonRequest("POST", input), token);
}

export function reconcileCollectionBatch(token: string, batchId: string, notes: string, version: number): Promise<void> {
  return request(`/api/v1/collection-batches/${batchId}/reconcile`, jsonRequest("POST", { notes, version }), token);
}

export function listReceivables(token: string, asOf: string, overdueOnly: boolean, page = 1, filters: ReceivableFilters = {}): Promise<{ items: ReceivableItem[]; page: number; pageSize: number; hasMore: boolean }> {
  return request(`/api/v1/receivables?${new URLSearchParams({ asOf, overdueOnly: String(overdueOnly), page: String(page), pageSize: "50", ...filters })}`, { method: "GET" }, token);
}

export function listOverdueAccounts(token: string, asOf: string, page = 1, filters: ReceivableFilters = {}): Promise<{ items: OverdueAccountItem[]; page: number; pageSize: number; hasMore: boolean }> {
  return request(`/api/v1/receivables/overdue-accounts?${new URLSearchParams({ asOf, page: String(page), pageSize: "50", ...filters })}`, { method: "GET" }, token);
}

export function getReceivableFilterOptions(token: string): Promise<ReceivableFilterOptions> {
  return request("/api/v1/receivables/filter-options", { method: "GET" }, token);
}

export function getAgingSummary(token: string, asOf: string): Promise<AgingSummary> {
  return request(`/api/v1/receivables/aging?asOf=${encodeURIComponent(asOf)}`, { method: "GET" }, token);
}

export function listSuspensionCandidates(token: string, asOf: string, minimumDaysOverdue: number, minimumBalanceCentavos: string): Promise<SuspensionCandidate[]> {
  return request(`/api/v1/receivables/suspension-candidates?asOf=${encodeURIComponent(asOf)}&minimumDaysOverdue=${minimumDaysOverdue}&minimumBalanceCentavos=${minimumBalanceCentavos}`, { method: "GET" }, token);
}

export function listServiceControl(token: string): Promise<ServiceControlList> {
  return request("/api/v1/service-control", { method: "GET" }, token);
}

export function requestSuspension(token: string, input: { serviceAccountId: string; asOf: string; reason: string }): Promise<ServiceControlRecord> {
  return request("/api/v1/suspensions", jsonRequest("POST", input), token);
}

export function requestReconnection(token: string, input: { serviceAccountId: string; reason: string; qualifyingPaymentId?: string }): Promise<ServiceControlRecord> {
  return request("/api/v1/reconnections", jsonRequest("POST", input), token);
}

export function actOnServiceControl(token: string, kind: "suspensions" | "reconnections", id: string, action: "approve" | "complete", version: number, notes = ""): Promise<void> {
  return request(`/api/v1/${kind}/${id}/${action}`, jsonRequest("POST", action === "approve" ? { version, notes } : { version }), token);
}

export function getDashboard(token: string, asOf: string): Promise<DashboardData> {
  return request(`/api/v1/dashboard?asOf=${encodeURIComponent(asOf)}`, { method: "GET" }, token);
}

export function listReportDefinitions(token: string): Promise<Array<{ code: string; name: string; parameters: readonly string[] }>> {
  return request("/api/v1/reports", { method: "GET" }, token);
}

export function previewReport(token: string, code: string, parameters: Record<string, string>): Promise<ReportDocument> {
  return request(`/api/v1/reports/${encodeURIComponent(code)}/preview?${new URLSearchParams(parameters)}`, { method: "GET" }, token);
}

export async function exportReport(token: string, code: string, parameters: Record<string, string>, format: "pdf" | "xlsx"): Promise<{ bytes: Uint8Array; filename: string }> {
  const response = await fetch(`${apiBaseUrl}/api/v1/reports/${encodeURIComponent(code)}/export?${new URLSearchParams({ ...parameters, format })}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) { const payload = await response.json() as { error?: { code: string; message: string } }; throw new ApiError(payload.error?.code ?? "EXPORT_FAILED", payload.error?.message ?? "The export failed.", response.status); }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([A-Za-z0-9._-]+)"/)?.[1] ?? `bcis-report.${format}`;
  return { bytes: new Uint8Array(await response.arrayBuffer()), filename };
}

export function listBackups(token: string): Promise<BackupRun[]> { return request("/api/v1/backups", { method: "GET" }, token); }
export function getBackupPreflight(token: string): Promise<{ backupRoot: string; pgDump: { available: boolean; version: string }; pgRestore: { available: boolean; version: string }; operationRunning: boolean; maintenanceMode: boolean }> { return request("/api/v1/backups/preflight", { method: "GET" }, token); }
export function createBackup(token: string): Promise<BackupRun> { return request("/api/v1/backups", { method: "POST" }, token); }
export function verifyBackup(token: string, id: string): Promise<BackupRun> { return request(`/api/v1/backups/${id}/verify`, { method: "POST" }, token); }
export function restoreBackup(token: string, id: string, password: string, confirmation: string): Promise<void> { return request(`/api/v1/backups/${id}/restore`, jsonRequest("POST", { password, confirmation }), token); }
export function listAuditLogs(token: string, filters: { action?: string; entityType?: string; dateFrom?: string; dateTo?: string }, page = 1): Promise<{ items: AuditLogItem[]; page: number; pageSize: number; hasMore: boolean }> { const query = new URLSearchParams({ page: String(page), pageSize: "50" }); Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); }); return request(`/api/v1/audit-logs?${query}`, { method: "GET" }, token); }

export async function getHealthState(signal?: AbortSignal): Promise<HealthState> {
  try {
    const liveResponse = await fetch(`${apiBaseUrl}/api/v1/health/live`, { signal: signal ?? null });
    if (!liveResponse.ok) return { api: "offline", database: "unavailable" };
    const readyResponse = await fetch(`${apiBaseUrl}/api/v1/health/ready`, { signal: signal ?? null });
    return { api: "online", database: readyResponse.ok ? "ready" : "unavailable" };
  } catch {
    return { api: "offline", database: "unavailable" };
  }
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data?: T; error?: { code: string; message: string } };
  if (!response.ok || !payload.data) {
    const error = new ApiError(payload.error?.code ?? "REQUEST_FAILED", payload.error?.message ?? "The request failed.", response.status);
    if (token && (error.code === "AUTHENTICATION_REQUIRED" || error.code === "SESSION_LOCKED" || error.status === 403)) sessionFailureHandler?.(token, error);
    throw error;
  }
  return payload.data;
}

function jsonRequest(method: string, input: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(input) };
}
