import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  collectionAreas,
  collectionRoutes,
  collectorAssignments,
  collectors,
  numberSequences,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscriberAddresses,
  subscriberContacts,
  subscribers
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";

export interface AddressInput {
  type: "BILLING" | "SERVICE" | "MAILING" | "OTHER";
  label?: string | undefined;
  line1: string;
  line2?: string | undefined;
  barangay: string;
  cityMunicipality: string;
  province: string;
  postalCode?: string | undefined;
  isPrimary: boolean;
}

export interface ContactInput {
  type: "MOBILE" | "PHONE" | "EMAIL" | "OTHER";
  value: string;
  isPrimary: boolean;
}

export class SubscriberService {
  constructor(private readonly db: BcisDatabase) {}

  async listServiceTypes() {
    return this.db.select().from(serviceTypes).where(eq(serviceTypes.isActive, true)).orderBy(asc(serviceTypes.name));
  }

  async listPlans(includeInactive = false) {
    const rows = await this.db
      .select({ plan: servicePlans, serviceTypeCode: serviceTypes.code, serviceTypeName: serviceTypes.name })
      .from(servicePlans)
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
      .where(includeInactive ? undefined : eq(servicePlans.isActive, true))
      .orderBy(asc(servicePlans.name));
    return rows.map((row) => ({ ...row, plan: serializePlan(row.plan) }));
  }

  async createPlan(input: {
    code: string;
    serviceTypeId: string;
    name: string;
    description: string;
    priceCentavos: string;
    installationFeeCentavos: string;
    reconnectionFeeCentavos: string;
    internetSpeedMbps?: number | undefined;
    cableChannelCount?: number | undefined;
  }, actor: SecurityActor) {
    const [type] = await this.db.select().from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1);
    if (!type?.isActive) throw new AppError(400, "INVALID_SERVICE_TYPE", "Select an active service type.");
    validatePlanFields(type.code, input.internetSpeedMbps, input.cableChannelCount);

    return this.db.transaction(async (transaction) => {
      const [created] = await transaction.insert(servicePlans).values({
        code: input.code.trim().toUpperCase(),
        serviceTypeId: input.serviceTypeId,
        name: input.name.trim(),
        description: input.description.trim(),
        priceCentavos: BigInt(input.priceCentavos),
        installationFeeCentavos: BigInt(input.installationFeeCentavos),
        reconnectionFeeCentavos: BigInt(input.reconnectionFeeCentavos),
        internetSpeedMbps: input.internetSpeedMbps ?? null,
        cableChannelCount: input.cableChannelCount ?? null
      }).returning();
      if (!created) throw new Error("The plan could not be created.");
      await audit(transaction, actor, "plan.create", "service_plan", created.id, { code: created.code, name: created.name });
      return serializePlan(created);
    });
  }

  async setPlanActive(planId: string, isActive: boolean, actor: SecurityActor, expectedVersion?: number): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: servicePlans.id, isActive: servicePlans.isActive, version: servicePlans.version }).from(servicePlans).where(eq(servicePlans.id, planId)).for("update").limit(1);
      if (!current) throw new AppError(404, "PLAN_NOT_FOUND", "The plan was not found.");
      if (expectedVersion !== undefined && current.version !== expectedVersion) throw new AppError(409, "CONCURRENCY_CONFLICT", "The plan changed. Reload it before changing its status.");
      if (current.isActive === isActive) return;
      await transaction.update(servicePlans).set({ isActive, version: sql`${servicePlans.version} + 1`, updatedAt: new Date() }).where(eq(servicePlans.id, planId));
      await audit(transaction, actor, isActive ? "plan.activate" : "plan.deactivate", "service_plan", planId, { isActive });
    });
  }

  async updatePlan(planId: string, input: { name: string; description: string; priceCentavos: string; installationFeeCentavos: string; reconnectionFeeCentavos: string; version: number }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction.select({ priceCentavos: servicePlans.priceCentavos, version: servicePlans.version }).from(servicePlans).where(eq(servicePlans.id, planId)).for("update").limit(1);
      if (!current || current.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The plan changed. Reload it before saving.");
      const [updated] = await transaction.update(servicePlans).set({ name: input.name.trim(), description: input.description.trim(), priceCentavos: BigInt(input.priceCentavos), installationFeeCentavos: BigInt(input.installationFeeCentavos), reconnectionFeeCentavos: BigInt(input.reconnectionFeeCentavos), version: sql`${servicePlans.version} + 1`, updatedAt: new Date() }).where(and(eq(servicePlans.id, planId), eq(servicePlans.version, input.version))).returning();
      if (!updated) throw new AppError(409, "CONCURRENCY_CONFLICT", "The plan changed. Reload it before saving.");
      let affectedServices = 0;
      if (current.priceCentavos !== updated.priceCentavos) {
        const changed = await transaction.update(serviceAccounts).set({ currentRateCentavos: updated.priceCentavos, version: sql`${serviceAccounts.version} + 1`, updatedAt: new Date() }).where(and(eq(serviceAccounts.planId, planId), ne(serviceAccounts.status, "TERMINATED"))).returning({ id: serviceAccounts.id });
        affectedServices = changed.length;
        if (changed.length > 0) await transaction.insert(serviceEvents).values(changed.map(({ id }) => ({ serviceAccountId: id, type: "NOTE" as const, description: `Monthly plan rate changed to ${updated.priceCentavos.toString()} centavos for future billing.`, actorUserId: actor.userId })));
      }
      await audit(transaction, actor, "plan.update", "service_plan", planId, { name: updated.name, oldPriceCentavos: current.priceCentavos.toString(), priceCentavos: updated.priceCentavos.toString(), affectedServices, version: updated.version });
      return serializePlan(updated);
    });
  }

  async listSubscribers(input: { search?: string | undefined; status?: "ACTIVE" | "INACTIVE" | "TERMINATED" | "ARCHIVED" | undefined; page: number; pageSize: number }) {
    const pattern = `%${normalizeSearch(input.search ?? "")}%`;
    const searchCondition = input.search
      ? or(
          ilike(subscribers.accountNumber, pattern),
          ilike(subscribers.normalizedName, pattern),
          ilike(subscriberContacts.normalizedValue, pattern),
          ilike(subscriberAddresses.normalizedSearch, pattern)
        )
      : undefined;
    const where = input.status && searchCondition
      ? and(eq(subscribers.status, input.status), searchCondition)
      : input.status ? eq(subscribers.status, input.status) : searchCondition;

    const rows = await this.db
      .selectDistinct({
        id: subscribers.id,
        accountNumber: subscribers.accountNumber,
        firstName: subscribers.firstName,
        lastName: subscribers.lastName,
        status: subscribers.status,
        billingDay: subscribers.billingDay,
        dueDay: subscribers.dueDay,
        updatedAt: subscribers.updatedAt
      })
      .from(subscribers)
      .leftJoin(subscriberContacts, and(eq(subscriberContacts.subscriberId, subscribers.id), eq(subscriberContacts.isActive, true)))
      .leftJoin(subscriberAddresses, and(eq(subscriberAddresses.subscriberId, subscribers.id), eq(subscriberAddresses.isActive, true)))
      .where(where)
      .orderBy(desc(subscribers.updatedAt), asc(subscribers.accountNumber))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    return { items: rows, page: input.page, pageSize: input.pageSize, hasMore: rows.length === input.pageSize };
  }

  async createSubscriber(input: {
    firstName: string;
    middleName?: string | undefined;
    lastName: string;
    suffix?: string | undefined;
    billingDay: number;
    dueDay: number;
    collectionAreaId?: string | undefined;
    assignedCollectorId?: string | undefined;
    notes?: string | undefined;
    addresses: AddressInput[];
    contacts: ContactInput[];
  }, actor: SecurityActor) {
    if (!input.addresses.some((address) => address.isPrimary)) throw new AppError(400, "PRIMARY_ADDRESS_REQUIRED", "Mark one address as primary.");
    if (!input.contacts.some((contact) => contact.isPrimary)) throw new AppError(400, "PRIMARY_CONTACT_REQUIRED", "Mark one contact as primary.");

    return this.db.transaction(async (transaction) => {
      const [sequence] = await transaction.insert(numberSequences).values({ code: "SUBSCRIBER", lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue });
      if (!sequence) throw new Error("Subscriber number generation failed.");
      const accountNumber = `SUB-${sequence.value.toString().padStart(7, "0")}`;
      const [created] = await transaction.insert(subscribers).values({
        accountNumber,
        firstName: input.firstName.trim(),
        middleName: input.middleName?.trim() || null,
        lastName: input.lastName.trim(),
        suffix: input.suffix?.trim() || null,
        normalizedName: normalizeSearch([input.firstName, input.middleName, input.lastName, input.suffix].filter(Boolean).join(" ")),
        billingDay: input.billingDay,
        dueDay: input.dueDay,
        collectionAreaId: input.collectionAreaId ?? null,
        assignedCollectorId: input.assignedCollectorId ?? null,
        notes: input.notes?.trim() ?? ""
      }).returning();
      if (!created) throw new Error("The subscriber could not be created.");

      await transaction.insert(subscriberAddresses).values(input.addresses.map((address) => ({
        subscriberId: created.id,
        type: address.type,
        label: address.label?.trim() ?? "",
        line1: address.line1.trim(),
        line2: address.line2?.trim() || null,
        barangay: address.barangay.trim(),
        cityMunicipality: address.cityMunicipality.trim(),
        province: address.province.trim(),
        postalCode: address.postalCode?.trim() || null,
        normalizedSearch: normalizeSearch([address.line1, address.line2, address.barangay, address.cityMunicipality, address.province, address.postalCode].filter(Boolean).join(" ")),
        isPrimary: address.isPrimary
      })));
      await transaction.insert(subscriberContacts).values(input.contacts.map((contact) => ({ subscriberId: created.id, type: contact.type, value: contact.value.trim(), normalizedValue: normalizeContact(contact.value), isPrimary: contact.isPrimary })));
      await audit(transaction, actor, "subscriber.create", "subscriber", created.id, { accountNumber, name: `${created.firstName} ${created.lastName}` });
      return { id: created.id, accountNumber };
    });
  }

  async getSubscriber(subscriberId: string) {
    const [subscriber] = await this.db.select().from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
    const [addresses, contacts, services] = await Promise.all([
      this.db.select().from(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, subscriberId)).orderBy(desc(subscriberAddresses.isPrimary)),
      this.db.select().from(subscriberContacts).where(eq(subscriberContacts.subscriberId, subscriberId)).orderBy(desc(subscriberContacts.isPrimary)),
      this.db.select({ account: serviceAccounts, planName: servicePlans.name, planCode: servicePlans.code }).from(serviceAccounts).innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id)).where(eq(serviceAccounts.subscriberId, subscriberId)).orderBy(desc(serviceAccounts.createdAt))
    ]);
    const serviceIds = services.map((row) => row.account.id);
    const history = serviceIds.length === 0
      ? []
      : await this.db.select().from(serviceEvents).where(inArray(serviceEvents.serviceAccountId, serviceIds)).orderBy(desc(serviceEvents.occurredAt));
    return { subscriber, addresses, contacts, services: services.map((row) => ({ ...row, account: serializeServiceAccount(row.account) })), serviceHistory: history };
  }

  async updateSubscriber(subscriberId: string, input: { status: "ACTIVE" | "INACTIVE" | "TERMINATED" | "ARCHIVED"; billingDay: number; dueDay: number; notes: string; collectionAreaId?: string | undefined; assignedCollectorId?: string | undefined; version: number }, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!current || current.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      if (current.status !== input.status && input.status !== "ACTIVE") {
        const [openService] = await transaction.select({ id: serviceAccounts.id }).from(serviceAccounts).where(and(eq(serviceAccounts.subscriberId, subscriberId), ne(serviceAccounts.status, "TERMINATED"))).limit(1);
        if (openService) throw new AppError(409, "OPEN_SERVICES_EXIST", "Close all service accounts through their approved workflow before deactivating this subscriber.");
      }
      const [updated] = await transaction.update(subscribers).set({ status: input.status, billingDay: input.billingDay, dueDay: input.dueDay, notes: input.notes.trim(), collectionAreaId: input.collectionAreaId ?? current.collectionAreaId, assignedCollectorId: input.assignedCollectorId ?? current.assignedCollectorId, version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(and(eq(subscribers.id, subscriberId), eq(subscribers.version, input.version))).returning({ version: subscribers.version });
      if (!updated) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      await audit(transaction, actor, "subscriber.update", "subscriber", subscriberId, { status: input.status, billingDay: input.billingDay, dueDay: input.dueDay, version: updated.version });
    });
  }

  async updateSubscriberIdentity(subscriberId: string, input: { firstName: string; middleName: string; lastName: string; suffix: string; version: number }, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const firstName = input.firstName.trim();
      const middleName = input.middleName.trim();
      const lastName = input.lastName.trim();
      const suffix = input.suffix.trim();
      const [updated] = await transaction.update(subscribers).set({
        firstName,
        middleName: middleName || null,
        lastName,
        suffix: suffix || null,
        normalizedName: normalizeSearch([firstName, middleName, lastName, suffix].filter(Boolean).join(" ")),
        version: sql`${subscribers.version} + 1`,
        updatedAt: new Date()
      }).where(and(eq(subscribers.id, subscriberId), eq(subscribers.version, input.version))).returning({ version: subscribers.version });
      if (!updated) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      await audit(transaction, actor, "subscriber.identity.update", "subscriber", subscriberId, { version: updated.version, firstName, lastName });
    });
  }

  async addSubscriberContact(subscriberId: string, input: ContactInput & { version: number }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ id: subscribers.id, version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const activeContacts = await transaction.select({ type: subscriberContacts.type, normalizedValue: subscriberContacts.normalizedValue }).from(subscriberContacts).where(and(eq(subscriberContacts.subscriberId, subscriberId), eq(subscriberContacts.isActive, true)));
      if (activeContacts.length >= 10) throw new AppError(409, "CONTACT_LIMIT_REACHED", "A subscriber can have at most ten active contacts.");
      const normalizedValue = input.type === "OTHER" ? normalizeSearch(input.value) : normalizeContact(input.value);
      if (!normalizedValue) throw new AppError(400, "INVALID_CONTACT", "Enter a searchable contact value.");
      if (activeContacts.some((contact) => contact.type === input.type && contact.normalizedValue === normalizedValue)) throw new AppError(409, "DUPLICATE_CONTACT", "This contact is already active for the subscriber.");
      if (input.isPrimary) await transaction.update(subscriberContacts).set({ isPrimary: false }).where(and(eq(subscriberContacts.subscriberId, subscriberId), eq(subscriberContacts.isActive, true), eq(subscriberContacts.isPrimary, true)));
      const [created] = await transaction.insert(subscriberContacts).values({ subscriberId, type: input.type, value: input.value.trim(), normalizedValue, isPrimary: input.isPrimary }).returning({ id: subscriberContacts.id });
      if (!created) throw new Error("The contact could not be created.");
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.contact.add", "subscriber", subscriberId, { contactId: created.id, type: input.type, isPrimary: input.isPrimary });
      return created;
    });
  }

  async replaceSubscriberContact(subscriberId: string, contactId: string, input: ContactInput & { version: number }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const contacts = await transaction.select().from(subscriberContacts).where(and(eq(subscriberContacts.subscriberId, subscriberId), eq(subscriberContacts.isActive, true))).orderBy(asc(subscriberContacts.createdAt), asc(subscriberContacts.id));
      const current = contacts.find((contact) => contact.id === contactId);
      if (!current) throw new AppError(404, "CONTACT_NOT_FOUND", "The active contact was not found.");
      const normalizedValue = input.type === "OTHER" ? normalizeSearch(input.value) : normalizeContact(input.value);
      if (!normalizedValue) throw new AppError(400, "INVALID_CONTACT", "Enter a searchable contact value.");
      if (contacts.some((contact) => contact.id !== contactId && contact.type === input.type && contact.normalizedValue === normalizedValue)) throw new AppError(409, "DUPLICATE_CONTACT", "This contact is already active for the subscriber.");
      const isPrimary = input.isPrimary || current.isPrimary;
      if (isPrimary) await transaction.update(subscriberContacts).set({ isPrimary: false }).where(and(eq(subscriberContacts.subscriberId, subscriberId), eq(subscriberContacts.isActive, true), eq(subscriberContacts.isPrimary, true)));
      await transaction.update(subscriberContacts).set({ isActive: false, isPrimary: false }).where(eq(subscriberContacts.id, contactId));
      const [created] = await transaction.insert(subscriberContacts).values({ subscriberId, type: input.type, value: input.value.trim(), normalizedValue, isPrimary }).returning({ id: subscriberContacts.id });
      if (!created) throw new Error("The replacement contact could not be created.");
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.contact.replace", "subscriber", subscriberId, { oldContactId: contactId, newContactId: created.id, type: input.type, isPrimary });
      return created;
    });
  }

  async deactivateSubscriberContact(subscriberId: string, contactId: string, version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const contacts = await transaction.select().from(subscriberContacts).where(and(eq(subscriberContacts.subscriberId, subscriberId), eq(subscriberContacts.isActive, true))).orderBy(asc(subscriberContacts.createdAt), asc(subscriberContacts.id));
      const current = contacts.find((contact) => contact.id === contactId);
      if (!current) throw new AppError(404, "CONTACT_NOT_FOUND", "The active contact was not found.");
      if (contacts.length === 1) throw new AppError(409, "PRIMARY_CONTACT_REQUIRED", "Keep at least one active subscriber contact.");
      await transaction.update(subscriberContacts).set({ isActive: false, isPrimary: false }).where(eq(subscriberContacts.id, contactId));
      const fallback = current.isPrimary ? contacts.find((contact) => contact.id !== contactId) : undefined;
      if (fallback) await transaction.update(subscriberContacts).set({ isPrimary: true }).where(eq(subscriberContacts.id, fallback.id));
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.contact.deactivate", "subscriber", subscriberId, { contactId, fallbackContactId: fallback?.id ?? null });
    });
  }

  async addSubscriberAddress(subscriberId: string, input: AddressInput & { version: number }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ id: subscribers.id, version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const activeAddresses = await transaction.select({ type: subscriberAddresses.type, normalizedSearch: subscriberAddresses.normalizedSearch }).from(subscriberAddresses).where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isActive, true)));
      if (activeAddresses.length >= 10) throw new AppError(409, "ADDRESS_LIMIT_REACHED", "A subscriber can have at most ten active addresses.");
      const normalizedSearch = normalizeSearch([input.line1, input.line2, input.barangay, input.cityMunicipality, input.province, input.postalCode].filter(Boolean).join(" "));
      if (activeAddresses.some((address) => address.type === input.type && address.normalizedSearch === normalizedSearch)) throw new AppError(409, "DUPLICATE_ADDRESS", "This address is already active for the subscriber.");
      if (input.isPrimary) await transaction.update(subscriberAddresses).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isActive, true), eq(subscriberAddresses.isPrimary, true)));
      const [created] = await transaction.insert(subscriberAddresses).values({ subscriberId, type: input.type, label: input.label?.trim() ?? "", line1: input.line1.trim(), line2: input.line2?.trim() || null, barangay: input.barangay.trim(), cityMunicipality: input.cityMunicipality.trim(), province: input.province.trim(), postalCode: input.postalCode?.trim() || null, normalizedSearch, isPrimary: input.isPrimary }).returning({ id: subscriberAddresses.id });
      if (!created) throw new Error("The address could not be created.");
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.address.add", "subscriber", subscriberId, { addressId: created.id, type: input.type, isPrimary: input.isPrimary });
      return created;
    });
  }

  async replaceSubscriberAddress(subscriberId: string, addressId: string, input: AddressInput & { version: number }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const addresses = await transaction.select().from(subscriberAddresses).where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isActive, true))).orderBy(asc(subscriberAddresses.createdAt), asc(subscriberAddresses.id));
      const current = addresses.find((address) => address.id === addressId);
      if (!current) throw new AppError(404, "ADDRESS_NOT_FOUND", "The active address was not found.");
      const [referenced] = await transaction.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.installationAddressId, addressId)).limit(1);
      if (referenced) throw new AppError(409, "ADDRESS_IN_USE", "Change the service account address through its approved editor before replacing this address.");
      const normalizedSearch = normalizeSearch([input.line1, input.line2, input.barangay, input.cityMunicipality, input.province, input.postalCode].filter(Boolean).join(" "));
      if (addresses.some((address) => address.id !== addressId && address.type === input.type && address.normalizedSearch === normalizedSearch)) throw new AppError(409, "DUPLICATE_ADDRESS", "This address is already active for the subscriber.");
      const isPrimary = input.isPrimary || current.isPrimary;
      if (isPrimary) await transaction.update(subscriberAddresses).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isActive, true), eq(subscriberAddresses.isPrimary, true)));
      await transaction.update(subscriberAddresses).set({ isActive: false, isPrimary: false, updatedAt: new Date() }).where(eq(subscriberAddresses.id, addressId));
      const [created] = await transaction.insert(subscriberAddresses).values({ subscriberId, type: input.type, label: input.label?.trim() ?? "", line1: input.line1.trim(), line2: input.line2?.trim() || null, barangay: input.barangay.trim(), cityMunicipality: input.cityMunicipality.trim(), province: input.province.trim(), postalCode: input.postalCode?.trim() || null, normalizedSearch, isPrimary }).returning({ id: subscriberAddresses.id });
      if (!created) throw new Error("The replacement address could not be created.");
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.address.replace", "subscriber", subscriberId, { oldAddressId: addressId, newAddressId: created.id, type: input.type, isPrimary });
      return created;
    });
  }

  async deactivateSubscriberAddress(subscriberId: string, addressId: string, version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ version: subscribers.version }).from(subscribers).where(eq(subscribers.id, subscriberId)).for("update").limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      if (subscriber.version !== version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The subscriber changed. Reload it before saving.");
      const addresses = await transaction.select().from(subscriberAddresses).where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isActive, true))).orderBy(asc(subscriberAddresses.createdAt), asc(subscriberAddresses.id));
      const current = addresses.find((address) => address.id === addressId);
      if (!current) throw new AppError(404, "ADDRESS_NOT_FOUND", "The active address was not found.");
      if (addresses.length === 1) throw new AppError(409, "PRIMARY_ADDRESS_REQUIRED", "Keep at least one active subscriber address.");
      const [referenced] = await transaction.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.installationAddressId, addressId)).limit(1);
      if (referenced) throw new AppError(409, "ADDRESS_IN_USE", "Change the service account address through its approved editor before deactivating this address.");
      await transaction.update(subscriberAddresses).set({ isActive: false, isPrimary: false, updatedAt: new Date() }).where(eq(subscriberAddresses.id, addressId));
      const fallback = current.isPrimary ? addresses.find((address) => address.id !== addressId) : undefined;
      if (fallback) await transaction.update(subscriberAddresses).set({ isPrimary: true, updatedAt: new Date() }).where(eq(subscriberAddresses.id, fallback.id));
      await transaction.update(subscribers).set({ version: sql`${subscribers.version} + 1`, updatedAt: new Date() }).where(eq(subscribers.id, subscriberId));
      await audit(transaction, actor, "subscriber.address.deactivate", "subscriber", subscriberId, { addressId, fallbackAddressId: fallback?.id ?? null });
    });
  }

  async createServiceAccount(input: { subscriberId: string; planId: string; installationAddressId: string; billingStartDate: string; activationDate?: string | undefined; billingDay: number; dueDay: number; assignedCollectorId?: string | undefined }, actor: SecurityActor) {
    const [[subscriber], [plan], [address]] = await Promise.all([
      this.db.select().from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1),
      this.db.select().from(servicePlans).where(eq(servicePlans.id, input.planId)).limit(1),
      this.db.select().from(subscriberAddresses).where(and(eq(subscriberAddresses.id, input.installationAddressId), eq(subscriberAddresses.subscriberId, input.subscriberId), eq(subscriberAddresses.isActive, true))).limit(1)
    ]);
    if (!subscriber || subscriber.status !== "ACTIVE") throw new AppError(400, "INACTIVE_SUBSCRIBER", "The subscriber must be active.");
    if (!plan?.isActive) throw new AppError(400, "INACTIVE_PLAN", "Select an active plan.");
    if (!address) throw new AppError(400, "INVALID_SERVICE_ADDRESS", "Select an active address owned by this subscriber.");

    return this.db.transaction(async (transaction) => {
      const [lockedSubscriber] = await transaction.select({ status: subscribers.status }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).for("update").limit(1);
      if (lockedSubscriber?.status !== "ACTIVE") throw new AppError(409, "INACTIVE_SUBSCRIBER", "The subscriber must still be active when creating the service.");
      const [currentAddress] = await transaction.select({ id: subscriberAddresses.id }).from(subscriberAddresses).where(and(eq(subscriberAddresses.id, input.installationAddressId), eq(subscriberAddresses.subscriberId, input.subscriberId), eq(subscriberAddresses.isActive, true))).limit(1);
      if (!currentAddress) throw new AppError(409, "INVALID_SERVICE_ADDRESS", "The selected address changed. Reload before creating the service.");
      const [sequence] = await transaction.insert(numberSequences).values({ code: "SERVICE_ACCOUNT", lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue });
      if (!sequence) throw new Error("Service number generation failed.");
      const serviceAccountNumber = `SVC-${sequence.value.toString().padStart(7, "0")}`;
      const [created] = await transaction.insert(serviceAccounts).values({
        serviceAccountNumber,
        subscriberId: input.subscriberId,
        planId: input.planId,
        installationAddressId: input.installationAddressId,
        assignedCollectorId: input.assignedCollectorId ?? null,
        activationDate: input.activationDate ?? null,
        billingStartDate: input.billingStartDate,
        billingDay: input.billingDay,
        dueDay: input.dueDay,
        currentRateCentavos: plan.priceCentavos,
        status: input.activationDate ? "ACTIVE" : "PENDING"
      }).returning();
      if (!created) throw new Error("The service account could not be created.");
      await transaction.insert(serviceEvents).values({ serviceAccountId: created.id, type: input.activationDate ? "ACTIVATED" : "CREATED", description: `Service created on plan ${plan.code}.`, newStatus: created.status, actorUserId: actor.userId });
      await audit(transaction, actor, "service.create", "service_account", created.id, { serviceAccountNumber, planCode: plan.code, rateCentavos: plan.priceCentavos.toString() });
      return serializeServiceAccount(created);
    });
  }

  async updateServiceAccount(serviceAccountId: string, input: { planId: string; installationAddressId: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISCONNECTED" | "TERMINATED"; reason: string; version: number }, actor: SecurityActor): Promise<void> {
    const [[current], [plan]] = await Promise.all([
      this.db.select().from(serviceAccounts).where(eq(serviceAccounts.id, serviceAccountId)).limit(1),
      this.db.select().from(servicePlans).where(eq(servicePlans.id, input.planId)).limit(1)
    ]);
    if (!current) throw new AppError(404, "SERVICE_ACCOUNT_NOT_FOUND", "The service account was not found.");
    if (!plan || (current.planId !== input.planId && !plan.isActive)) throw new AppError(400, "INACTIVE_PLAN", "Select an active plan for a plan change.");
    validateGenericServiceUpdate(current.status, input.status);
    const [address] = await this.db.select().from(subscriberAddresses).where(and(eq(subscriberAddresses.id, input.installationAddressId), eq(subscriberAddresses.subscriberId, current.subscriberId), eq(subscriberAddresses.isActive, true))).limit(1);
    if (!address) throw new AppError(400, "INVALID_SERVICE_ADDRESS", "Select an active address owned by this subscriber.");

    await this.db.transaction(async (transaction) => {
      await transaction.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.id, current.subscriberId)).for("update").limit(1);
      const [currentAddress] = await transaction.select({ id: subscriberAddresses.id }).from(subscriberAddresses).where(and(eq(subscriberAddresses.id, input.installationAddressId), eq(subscriberAddresses.subscriberId, current.subscriberId), eq(subscriberAddresses.isActive, true))).limit(1);
      if (!currentAddress) throw new AppError(409, "INVALID_SERVICE_ADDRESS", "The selected address changed. Reload before saving the service.");
      const rateCentavos = current.planId === input.planId ? current.currentRateCentavos : plan.priceCentavos;
      const [updated] = await transaction.update(serviceAccounts).set({ planId: input.planId, installationAddressId: input.installationAddressId, currentRateCentavos: rateCentavos, status: input.status, version: sql`${serviceAccounts.version} + 1`, updatedAt: new Date() }).where(and(eq(serviceAccounts.id, serviceAccountId), eq(serviceAccounts.version, input.version))).returning({ version: serviceAccounts.version });
      if (!updated) throw new AppError(409, "CONCURRENCY_CONFLICT", "The service account changed. Reload it before saving.");
      const type = current.status !== input.status
        ? serviceStatusEventType(current.status, input.status)
        : current.planId !== input.planId ? "PLAN_CHANGED" : current.installationAddressId !== input.installationAddressId ? "ADDRESS_CHANGED" : "NOTE";
      await transaction.insert(serviceEvents).values({ serviceAccountId, type, description: input.reason.trim(), oldStatus: current.status, newStatus: input.status, actorUserId: actor.userId });
      await audit(transaction, actor, "service.update", "service_account", serviceAccountId, { planCode: plan.code, status: input.status, rateCentavos: rateCentavos.toString(), version: updated.version });
    });
  }

  async listCollectionSetup() {
    const [areas, routes, collectorRows] = await Promise.all([
      this.db.select().from(collectionAreas).orderBy(asc(collectionAreas.name)),
      this.db.select().from(collectionRoutes).orderBy(asc(collectionRoutes.name)),
      this.db.select().from(collectors).orderBy(asc(collectors.displayName))
    ]);
    return { areas, routes, collectors: collectorRows };
  }

  async listCollectorAssignments(serviceAccountId: string) {
    const [service] = await this.db.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.id, serviceAccountId)).limit(1);
    if (!service) throw new AppError(404, "SERVICE_ACCOUNT_NOT_FOUND", "The service account was not found.");
    return this.db.select({ id: collectorAssignments.id, collectorId: collectorAssignments.collectorId, collectorName: collectors.displayName, routeId: collectorAssignments.routeId, routeName: collectionRoutes.name, effectiveFrom: collectorAssignments.effectiveFrom, effectiveTo: collectorAssignments.effectiveTo })
      .from(collectorAssignments)
      .innerJoin(collectors, eq(collectorAssignments.collectorId, collectors.id))
      .leftJoin(collectionRoutes, eq(collectorAssignments.routeId, collectionRoutes.id))
      .where(eq(collectorAssignments.serviceAccountId, serviceAccountId))
      .orderBy(desc(collectorAssignments.effectiveFrom), desc(collectorAssignments.createdAt));
  }

  async createCollectionArea(input: { code: string; name: string; description: string }, actor: SecurityActor) {
    const [created] = await this.db.insert(collectionAreas).values({ code: input.code.toUpperCase(), name: input.name.trim(), description: input.description.trim() }).returning();
    if (!created) throw new Error("The area could not be created.");
    await this.db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "collection_area.create", entityType: "collection_area", entityId: created.id, requestId: actor.requestId ?? null, afterValues: { code: created.code, name: created.name } });
    return created;
  }

  async createCollectionRoute(input: { areaId: string; code: string; name: string; scheduleNotes: string }, actor: SecurityActor) {
    const [created] = await this.db.insert(collectionRoutes).values({ areaId: input.areaId, code: input.code.toUpperCase(), name: input.name.trim(), scheduleNotes: input.scheduleNotes.trim() }).returning();
    if (!created) throw new Error("The route could not be created.");
    await this.db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "collection_route.create", entityType: "collection_route", entityId: created.id, requestId: actor.requestId ?? null, afterValues: { code: created.code, name: created.name, areaId: created.areaId } });
    return created;
  }

  async createCollector(input: { code: string; displayName: string; contactNumber?: string | undefined }, actor: SecurityActor) {
    const [created] = await this.db.insert(collectors).values({ code: input.code.toUpperCase(), displayName: input.displayName.trim(), contactNumber: input.contactNumber?.trim() || null }).returning();
    if (!created) throw new Error("The collector could not be created.");
    await this.db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "collector.create", entityType: "collector", entityId: created.id, requestId: actor.requestId ?? null, afterValues: { code: created.code, name: created.displayName } });
    return created;
  }

  async assignCollector(input: { collectorId: string; routeId?: string | undefined; serviceAccountId: string; effectiveFrom: string }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [service] = await transaction.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.id, input.serviceAccountId)).for("update").limit(1);
      if (!service) throw new AppError(404, "SERVICE_ACCOUNT_NOT_FOUND", "The service account was not found.");
      const [collector] = await transaction.select({ id: collectors.id }).from(collectors).where(and(eq(collectors.id, input.collectorId), eq(collectors.isActive, true))).limit(1);
      if (!collector) throw new AppError(400, "INVALID_COLLECTOR", "Select an active collector.");
      if (input.routeId) {
        const [route] = await transaction.select({ id: collectionRoutes.id }).from(collectionRoutes).where(and(eq(collectionRoutes.id, input.routeId), eq(collectionRoutes.isActive, true))).limit(1);
        if (!route) throw new AppError(400, "INVALID_COLLECTION_ROUTE", "Select an active collection route.");
      }
      const [current] = await transaction.select({ effectiveFrom: collectorAssignments.effectiveFrom }).from(collectorAssignments).where(and(eq(collectorAssignments.serviceAccountId, input.serviceAccountId), sql`${collectorAssignments.effectiveTo} is null`)).limit(1);
      if (current && input.effectiveFrom <= current.effectiveFrom) throw new AppError(409, "INVALID_ASSIGNMENT_DATE", "The new assignment must start after the current assignment starts.");
      await transaction.update(collectorAssignments).set({ effectiveTo: input.effectiveFrom }).where(and(eq(collectorAssignments.serviceAccountId, input.serviceAccountId), sql`${collectorAssignments.effectiveTo} is null`));
      const [created] = await transaction.insert(collectorAssignments).values({ collectorId: input.collectorId, routeId: input.routeId ?? null, serviceAccountId: input.serviceAccountId, effectiveFrom: input.effectiveFrom, assignedBy: actor.userId }).returning();
      await transaction.update(serviceAccounts).set({ assignedCollectorId: input.collectorId, version: sql`${serviceAccounts.version} + 1`, updatedAt: new Date() }).where(eq(serviceAccounts.id, input.serviceAccountId));
      if (!created) throw new Error("The assignment could not be created.");
      await audit(transaction, actor, "collector.assign", "service_account", input.serviceAccountId, { collectorId: input.collectorId, routeId: input.routeId ?? null });
      return created;
    });
  }
}

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function normalizeContact(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase("en-US");
  return trimmed.includes("@") ? trimmed : trimmed.replace(/\D/g, "");
}

export function validatePlanFields(type: string, speed?: number, channels?: number): void {
  if ((type === "INTERNET" || type === "COMBO") && !speed) throw new AppError(400, "SPEED_REQUIRED", "Internet and Combo plans require an Internet speed.");
  if ((type === "CABLE" || type === "COMBO") && !channels) throw new AppError(400, "CHANNEL_COUNT_REQUIRED", "Cable and Combo plans require a channel count.");
}

export function validateServiceTransition(from: string, to: string): void {
  const allowed: Record<string, readonly string[]> = {
    PENDING: ["PENDING", "ACTIVE", "TERMINATED"],
    ACTIVE: ["ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"],
    SUSPENDED: ["SUSPENDED", "ACTIVE", "DISCONNECTED", "TERMINATED"],
    DISCONNECTED: ["DISCONNECTED", "ACTIVE", "TERMINATED"],
    TERMINATED: ["TERMINATED"]
  };
  if (!allowed[from]?.includes(to)) throw new AppError(409, "INVALID_SERVICE_TRANSITION", `Service cannot move from ${from} to ${to}.`);
}

/** The generic service editor cannot perform fieldwork or bypass independent approval. */
export function validateGenericServiceUpdate(from: string, to: string): void {
  validateServiceTransition(from, to);
  if (from !== to && ([from, to].some((status) => status === "SUSPENDED" || status === "DISCONNECTED"))) {
    throw new AppError(409, "SERVICE_CONTROL_WORKFLOW_REQUIRED", "Suspension and reconnection require the approved service-control workflow; disconnection remains unavailable.");
  }
}

export function serviceStatusEventType(from: string, to: string): "ACTIVATED" | "SUSPENDED" | "RECONNECTED" | "DISCONNECTED" | "TERMINATED" {
  if (to === "ACTIVE") return from === "PENDING" ? "ACTIVATED" : "RECONNECTED";
  if (to === "SUSPENDED") return "SUSPENDED";
  if (to === "DISCONNECTED") return "DISCONNECTED";
  if (to === "TERMINATED") return "TERMINATED";
  return "ACTIVATED";
}

function serializePlan(plan: typeof servicePlans.$inferSelect) {
  return { ...plan, priceCentavos: plan.priceCentavos.toString(), installationFeeCentavos: plan.installationFeeCentavos.toString(), reconnectionFeeCentavos: plan.reconnectionFeeCentavos.toString() };
}

function serializeServiceAccount(account: typeof serviceAccounts.$inferSelect) {
  return { ...account, currentRateCentavos: account.currentRateCentavos.toString() };
}

async function audit(transaction: Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0], actor: SecurityActor, action: string, entityType: string, entityId: string, afterValues: Record<string, unknown>): Promise<void> {
  await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action, entityType, entityId, requestId: actor.requestId ?? null, afterValues });
}
