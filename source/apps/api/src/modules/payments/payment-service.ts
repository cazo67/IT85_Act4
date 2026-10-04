import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  batchCollectionEntries,
  collectionBatches,
  invoices,
  ledgerEntries,
  numberSequences,
  paymentAllocations,
  paymentProofs,
  paymentReversals,
  payments,
  receipts,
  subscriberCredits,
  subscribers
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { allocateOldestFirst, invoiceSettlementStatus, normalizeExternalReference, normalizePaymentReference } from "./payment-rules.js";

export class PaymentService {
  constructor(private readonly db: BcisDatabase) {}

  async submitGcashProof(input: { subscriberId: string; amountCentavos: string; senderName: string; senderMobile: string; externalReference: string; originalFileName: string; imageBase64: string }, actor: SecurityActor) {
    const normalizedExternalReference = normalizeExternalReference(input.externalReference);
    const amount = BigInt(input.amountCentavos);
    const { bytes, mediaType } = decodeProofImage(input.imageBase64, input.originalFileName);
    return this.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-gcash:${normalizedExternalReference}`}))`);
      const [subscriber] = await transaction.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      const [existingProof] = await transaction.select({ id: paymentProofs.id }).from(paymentProofs).where(eq(paymentProofs.normalizedExternalReference, normalizedExternalReference)).limit(1);
      const [existingPayment] = await transaction.select({ id: payments.id }).from(payments).where(and(eq(payments.method, "GCASH"), eq(payments.normalizedExternalReference, normalizedExternalReference))).limit(1);
      if (existingProof || existingPayment) throw new AppError(409, "GCASH_REFERENCE_DUPLICATE", "This GCash reference was already submitted.");
      const [proof] = await transaction.insert(paymentProofs).values({
        subscriberId: input.subscriberId,
        amountCentavos: amount,
        senderName: input.senderName.trim(),
        senderMobile: input.senderMobile,
        externalReference: input.externalReference.trim(),
        normalizedExternalReference,
        originalFileName: input.originalFileName,
        storageKey: randomUUID(),
        mediaType,
        sizeBytes: BigInt(bytes.length),
        proofData: bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uploadedBy: actor.userId
      }).returning({ id: paymentProofs.id, status: paymentProofs.status, createdAt: paymentProofs.createdAt });
      if (!proof) throw new Error("The GCash proof could not be stored.");
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "gcash.proof.submit", entityType: "payment_proof", entityId: proof.id, requestId: actor.requestId ?? null, afterValues: { subscriberId: input.subscriberId, amountCentavos: amount.toString(), normalizedExternalReference } });
      return { ...proof, normalizedExternalReference, amountCentavos: amount.toString() };
    });
  }

  async getGcashProof(proofId: string) {
    const [proof] = await this.db.select({ id: paymentProofs.id, subscriberId: paymentProofs.subscriberId, amountCentavos: paymentProofs.amountCentavos, senderName: paymentProofs.senderName, senderMobile: paymentProofs.senderMobile, externalReference: paymentProofs.externalReference, normalizedExternalReference: paymentProofs.normalizedExternalReference, originalFileName: paymentProofs.originalFileName, mediaType: paymentProofs.mediaType, sizeBytes: paymentProofs.sizeBytes, status: paymentProofs.status, reviewReason: paymentProofs.reviewReason, createdAt: paymentProofs.createdAt, reviewedAt: paymentProofs.reviewedAt }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
    if (!proof) throw new AppError(404, "GCASH_PROOF_NOT_FOUND", "The GCash proof was not found.");
    return { ...proof, amountCentavos: proof.amountCentavos.toString(), sizeBytes: proof.sizeBytes.toString() };
  }

  async listGcashProofs(input: { status?: "PENDING" | "REJECTED" | "VERIFIED" | undefined; uploadedBy?: string | undefined; page: number; pageSize: number }) {
    const rows = await this.db.select({ id: paymentProofs.id, subscriberId: paymentProofs.subscriberId, amountCentavos: paymentProofs.amountCentavos, senderName: paymentProofs.senderName, senderMobile: paymentProofs.senderMobile, normalizedExternalReference: paymentProofs.normalizedExternalReference, status: paymentProofs.status, reviewReason: paymentProofs.reviewReason, mediaType: paymentProofs.mediaType, createdAt: paymentProofs.createdAt, reviewedAt: paymentProofs.reviewedAt }).from(paymentProofs).where(and(input.status ? eq(paymentProofs.status, input.status) : undefined, input.uploadedBy ? eq(paymentProofs.uploadedBy, input.uploadedBy) : undefined)).orderBy(desc(paymentProofs.createdAt), desc(paymentProofs.id)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    return { items: rows.slice(0, input.pageSize).map((row) => ({ ...row, amountCentavos: row.amountCentavos.toString() })), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }

  async getGcashProofImage(proofId: string) {
    const [proof] = await this.db.select({ mediaType: paymentProofs.mediaType, proofData: paymentProofs.proofData }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
    if (!proof) throw new AppError(404, "GCASH_PROOF_NOT_FOUND", "The GCash proof was not found.");
    return proof;
  }

  async rejectGcashProof(proofId: string, reason: string, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [proof] = await transaction.select({ id: paymentProofs.id, status: paymentProofs.status }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).for("update").limit(1);
      if (!proof) throw new AppError(404, "GCASH_PROOF_NOT_FOUND", "The GCash proof was not found.");
      if (proof.status !== "PENDING") throw new AppError(409, "GCASH_PROOF_NOT_PENDING", "Only a pending GCash proof may be rejected.");
      const reviewedAt = new Date();
      await transaction.update(paymentProofs).set({ status: "REJECTED", reviewReason: reason.trim(), reviewedBy: actor.userId, reviewedAt }).where(eq(paymentProofs.id, proofId));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "gcash.proof.reject", entityType: "payment_proof", entityId: proofId, requestId: actor.requestId ?? null, afterValues: { status: "REJECTED", reason: reason.trim() } });
      return { id: proofId, status: "REJECTED" as const, reviewedAt };
    });
  }

  async resubmitGcashProof(proofId: string, input: { amountCentavos: string; senderName: string; senderMobile: string; originalFileName: string; imageBase64: string }, actor: SecurityActor) {
    const { bytes, mediaType } = decodeProofImage(input.imageBase64, input.originalFileName);
    const amount = BigInt(input.amountCentavos);
    return this.db.transaction(async (transaction) => {
      const [proof] = await transaction.select({ id: paymentProofs.id, status: paymentProofs.status, amountCentavos: paymentProofs.amountCentavos, sha256: paymentProofs.sha256, normalizedExternalReference: paymentProofs.normalizedExternalReference }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).for("update").limit(1);
      if (!proof) throw new AppError(404, "GCASH_PROOF_NOT_FOUND", "The GCash proof was not found.");
      if (proof.status !== "REJECTED") throw new AppError(409, "GCASH_PROOF_NOT_REJECTED", "Only a rejected GCash proof may be corrected and resubmitted.");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await transaction.update(paymentProofs).set({ amountCentavos: amount, senderName: input.senderName.trim(), senderMobile: input.senderMobile, originalFileName: input.originalFileName, mediaType, sizeBytes: BigInt(bytes.length), proofData: bytes, sha256, status: "PENDING", reviewedBy: null, reviewedAt: null, reviewReason: null }).where(eq(paymentProofs.id, proofId));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "gcash.proof.resubmit", entityType: "payment_proof", entityId: proofId, requestId: actor.requestId ?? null, beforeValues: { amountCentavos: proof.amountCentavos.toString(), sha256: proof.sha256, status: "REJECTED" }, afterValues: { amountCentavos: amount.toString(), sha256, status: "PENDING", normalizedExternalReference: proof.normalizedExternalReference } });
      return { id: proofId, status: "PENDING" as const, amountCentavos: amount.toString(), normalizedExternalReference: proof.normalizedExternalReference };
    });
  }

  async verifyGcashProof(proofId: string, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [proof] = await transaction.select({ id: paymentProofs.id, subscriberId: paymentProofs.subscriberId, amountCentavos: paymentProofs.amountCentavos, externalReference: paymentProofs.externalReference, normalizedExternalReference: paymentProofs.normalizedExternalReference, status: paymentProofs.status }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).for("update").limit(1);
      if (!proof) throw new AppError(404, "GCASH_PROOF_NOT_FOUND", "The GCash proof was not found.");
      if (proof.status === "VERIFIED") {
        const [prior] = await transaction.select({ id: payments.id }).from(payments).where(and(eq(payments.method, "GCASH"), eq(payments.normalizedExternalReference, proof.normalizedExternalReference))).limit(1);
        if (!prior) throw new AppError(409, "GCASH_PROOF_PAYMENT_MISSING", "The verified proof has no matching payment.");
        return this.resultForPayment(transaction, prior.id);
      }
      if (proof.status !== "PENDING") throw new AppError(409, "GCASH_PROOF_NOT_PENDING", "Only a pending GCash proof may be verified.");
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-gcash:${proof.normalizedExternalReference}`}))`);
      const [duplicate] = await transaction.select({ id: payments.id }).from(payments).where(and(eq(payments.method, "GCASH"), eq(payments.normalizedExternalReference, proof.normalizedExternalReference))).limit(1);
      if (duplicate) throw new AppError(409, "GCASH_REFERENCE_DUPLICATE", "This GCash reference is already posted.");
      const result = await this.postInTransaction(transaction, { subscriberId: proof.subscriberId, amountCentavos: proof.amountCentavos.toString(), method: "GCASH", commandKey: `gcash-proof:${proof.id}`, externalReference: proof.externalReference, normalizedExternalReference: proof.normalizedExternalReference }, actor);
      const reviewedAt = new Date();
      await transaction.update(paymentProofs).set({ status: "VERIFIED", reviewedBy: actor.userId, reviewedAt, reviewReason: null }).where(eq(paymentProofs.id, proof.id));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "gcash.proof.verify", entityType: "payment_proof", entityId: proof.id, requestId: actor.requestId ?? null, afterValues: { status: "VERIFIED", paymentId: result.payment.id, reference: proof.normalizedExternalReference } });
      return result;
    });
  }

  async preview(subscriberId: string, amountCentavos: string) {
    const amount = BigInt(amountCentavos);
    const [subscriber] = await this.db.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
    const open = await this.openInvoices(this.db, subscriberId);
    const proposal = allocateOldestFirst(amount, open.map((invoice) => ({ invoiceId: invoice.id, remainingCentavos: invoice.totalCentavos - invoice.paidCentavos })));
    const byId = new Map(open.map((invoice) => [invoice.id, invoice]));
    return {
      subscriber,
      amountCentavos,
      outstandingCentavos: open.reduce((sum, invoice) => sum + invoice.totalCentavos - invoice.paidCentavos, 0n).toString(),
      unallocatedCentavos: proposal.unallocatedCentavos.toString(),
      overpaymentBlocked: false,
      allocations: proposal.allocations.map((allocation) => ({ invoiceId: allocation.invoiceId, invoiceNumber: byId.get(allocation.invoiceId)?.invoiceNumber ?? "", amountCentavos: allocation.amountCentavos.toString() }))
    };
  }

  async post(input: { subscriberId: string; serviceAccountId?: string | undefined; amountCentavos: string; method: "CASH" | "GCASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER"; commandKey: string; externalReference?: string | undefined; otherDescription?: string | undefined; receivedConfirmed?: true | undefined }, actor: SecurityActor, existingTransaction?: PaymentTransaction) {
    if (input.method === "GCASH") throw new AppError(409, "GCASH_POLICY_NOT_APPROVED", "Direct GCash posting is disabled; an authorized staff member must verify a pending proof against the receiver transaction history.");
    if (input.serviceAccountId && input.method !== "CASH") throw new AppError(409, "BATCH_NONCASH_NOT_APPROVED", "Collection-batch payments currently accept Cash only.");
    if (input.method === "CASH" && (input.externalReference || input.otherDescription || input.receivedConfirmed)) throw new AppError(400, "INVALID_CASH_DETAILS", "Cash payments do not use a transfer reference or confirmation assertion.");
    if (input.method !== "CASH" && input.receivedConfirmed !== true) throw new AppError(400, "PAYMENT_RECEIPT_NOT_CONFIRMED", "Confirm receipt or cheque clearing before posting this payment.");
    if (input.method !== "OTHER" && input.otherDescription) throw new AppError(400, "INVALID_PAYMENT_DETAILS", "Only Other payments use a description.");
    if (input.method === "OTHER" && (!input.otherDescription || input.otherDescription.trim().length < 10 || input.otherDescription.trim().length > 200)) throw new AppError(400, "OTHER_DESCRIPTION_REQUIRED", "Describe an Other payment in 10–200 characters.");
    const normalizedExternalReference = input.method === "CASH" ? undefined : normalizePaymentReference(input.externalReference ?? "");
    const execute = (transaction: PaymentTransaction) => this.postInTransaction(transaction, { subscriberId: input.subscriberId, serviceAccountId: input.serviceAccountId, amountCentavos: input.amountCentavos, method: input.method, commandKey: input.commandKey, ...(normalizedExternalReference ? { externalReference: input.externalReference?.trim(), normalizedExternalReference } : {}), ...(input.method === "OTHER" ? { otherDescription: input.otherDescription?.trim() } : {}) }, actor);
    return existingTransaction ? execute(existingTransaction) : this.db.transaction(execute);
  }

  private async postInTransaction(transaction: PaymentTransaction, input: { subscriberId: string; serviceAccountId?: string | undefined; amountCentavos: string; method: "CASH" | "GCASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER"; commandKey: string; externalReference?: string | undefined; normalizedExternalReference?: string | undefined; otherDescription?: string | undefined }, actor: SecurityActor) {
    const amount = BigInt(input.amountCentavos);
      if (input.normalizedExternalReference && input.method !== "GCASH") await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment-ref:${input.method}:${input.normalizedExternalReference}`}))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment:${input.subscriberId}`}))`);
      const [prior] = await transaction.select().from(payments).where(eq(payments.commandKey, input.commandKey)).limit(1);
      if (prior) {
        if (prior.subscriberId !== input.subscriberId || prior.amountCentavos !== amount || prior.method !== input.method || prior.normalizedExternalReference !== (input.normalizedExternalReference ?? null) || prior.otherDescription !== (input.otherDescription ?? null)) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This command key was already used for another payment.");
        return this.resultForPayment(transaction, prior.id);
      }

      if (input.normalizedExternalReference && input.method !== "GCASH") {
        const [duplicate] = await transaction.select({ id: payments.id }).from(payments).where(and(eq(payments.method, input.method), eq(payments.normalizedExternalReference, input.normalizedExternalReference))).limit(1);
        if (duplicate) throw new AppError(409, "PAYMENT_REFERENCE_DUPLICATE", "This payment method and reference were already posted.");
      }

      const [subscriber] = await transaction.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      const open = await this.openInvoices(transaction, input.subscriberId, true, input.serviceAccountId);
      const proposal = allocateOldestFirst(amount, open.map((invoice) => ({ invoiceId: invoice.id, remainingCentavos: invoice.totalCentavos - invoice.paidCentavos })));
      if (input.serviceAccountId && proposal.unallocatedCentavos > 0n) throw new AppError(409, "BATCH_BALANCE_CHANGED", "The route account balance changed; refresh the batch before collecting this amount.");

      const paymentNumber = `PAY-${(await nextSequence(transaction, "PAYMENT")).toString().padStart(8, "0")}`;
      const [payment] = await transaction.insert(payments).values({ paymentNumber, commandKey: input.commandKey, subscriberId: input.subscriberId, method: input.method, amountCentavos: amount, externalReference: input.externalReference ?? null, normalizedExternalReference: input.normalizedExternalReference ?? null, otherDescription: input.otherDescription ?? null, postedBy: actor.userId }).returning();
      if (!payment) throw new Error("The payment could not be created.");

      const invoiceMap = new Map(open.map((invoice) => [invoice.id, invoice]));
      const receiptAllocations: Array<{ invoiceNumber: string; amountCentavos: string }> = [];
      for (const allocation of proposal.allocations) {
        const invoice = invoiceMap.get(allocation.invoiceId);
        if (!invoice) throw new Error("An allocation invoice disappeared.");
        const nextPaid = invoice.paidCentavos + allocation.amountCentavos;
        await transaction.insert(paymentAllocations).values({ paymentId: payment.id, invoiceId: invoice.id, amountCentavos: allocation.amountCentavos });
        await transaction.update(invoices).set({ paidCentavos: nextPaid, status: invoiceSettlementStatus(nextPaid, invoice.totalCentavos) }).where(eq(invoices.id, invoice.id));
        receiptAllocations.push({ invoiceNumber: invoice.invoiceNumber, amountCentavos: allocation.amountCentavos.toString() });
      }
      if (proposal.unallocatedCentavos > 0n) {
        await transaction.insert(subscriberCredits).values({ subscriberId: input.subscriberId, sourcePaymentId: payment.id, originalCentavos: proposal.unallocatedCentavos, remainingCentavos: proposal.unallocatedCentavos });
      }

      await transaction.insert(ledgerEntries).values({ sequenceNumber: await nextSequence(transaction, "LEDGER"), subscriberId: input.subscriberId, paymentId: payment.id, type: "PAYMENT_CREDIT", description: `Payment ${paymentNumber}`, creditCentavos: amount, actorUserId: actor.userId });
      const receiptNumber = `OR-${(await nextSequence(transaction, "RECEIPT")).toString().padStart(8, "0")}`;
      const snapshot = { receiptNumber, paymentNumber, accountNumber: subscriber.accountNumber, subscriberName: `${subscriber.firstName} ${subscriber.lastName}`, method: input.method, ...(input.normalizedExternalReference ? { externalReference: input.normalizedExternalReference } : {}), ...(input.otherDescription ? { otherDescription: input.otherDescription } : {}), amountCentavos: amount.toString(), allocations: receiptAllocations, advanceCreditCentavos: proposal.unallocatedCentavos.toString(), issuedAt: new Date().toISOString() };
      const [receipt] = await transaction.insert(receipts).values({ receiptNumber, paymentId: payment.id, snapshot, issuedBy: actor.userId }).returning();
      if (!receipt) throw new Error("The receipt could not be created.");
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "payment.post", entityType: "payment", entityId: payment.id, requestId: actor.requestId ?? null, afterValues: { paymentNumber, receiptNumber, subscriberId: input.subscriberId, amountCentavos: amount.toString(), advanceCreditCentavos: proposal.unallocatedCentavos.toString(), method: input.method, ...(input.normalizedExternalReference ? { externalReference: input.normalizedExternalReference } : {}), ...(input.otherDescription ? { otherDescription: input.otherDescription } : {}) } });
      return { payment: serializePayment(payment), receipt: { ...receipt, snapshot }, allocations: receiptAllocations, advanceCreditCentavos: proposal.unallocatedCentavos.toString() };
  }

  async list(input: { subscriberId?: string | undefined; search?: string | undefined; page: number; pageSize: number }) {
    const search = input.search ? or(ilike(payments.paymentNumber, `%${input.search}%`), ilike(receipts.receiptNumber, `%${input.search}%`)) : undefined;
    const where = input.subscriberId && search ? and(eq(payments.subscriberId, input.subscriberId), search) : input.subscriberId ? eq(payments.subscriberId, input.subscriberId) : search;
    const rows = await this.db.select({ payment: payments, receiptNumber: receipts.receiptNumber }).from(payments).leftJoin(receipts, eq(receipts.paymentId, payments.id)).where(where).orderBy(desc(payments.paidAt), desc(payments.paymentNumber)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    return { items: rows.slice(0, input.pageSize).map((row) => ({ payment: serializePayment(row.payment), receiptNumber: row.receiptNumber })), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }

  async get(paymentId: string) {
    return this.resultForPayment(this.db, paymentId);
  }

  async reverse(paymentId: string, reason: string, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [target] = await transaction.select({ subscriberId: payments.subscriberId }).from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!target) throw new AppError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment:${target.subscriberId}`}))`);
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).for("update").limit(1);
      if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
      if (payment.status === "REVERSED") throw new AppError(409, "PAYMENT_ALREADY_REVERSED", "The payment is already reversed.");
      const [batchLink] = await transaction.select({ batchNumber: collectionBatches.batchNumber, status: collectionBatches.status }).from(batchCollectionEntries).innerJoin(collectionBatches, eq(batchCollectionEntries.batchId, collectionBatches.id)).where(eq(batchCollectionEntries.paymentId, paymentId)).limit(1);
      if (batchLink) throw new AppError(409, "BATCH_PAYMENT_REVERSAL_REQUIRES_RECONCILIATION", `Payment belongs to collection batch ${batchLink.batchNumber}; use the approved batch correction workflow.`);
      const allocations = await transaction.select().from(paymentAllocations).where(and(eq(paymentAllocations.paymentId, paymentId), eq(paymentAllocations.isReversed, false)));
      for (const allocation of allocations) {
        const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).for("update").limit(1);
        if (!invoice || invoice.paidCentavos < allocation.amountCentavos) throw new AppError(409, "REVERSAL_CONFLICT", "Invoice settlement changed and the payment cannot be reversed safely.");
        const nextPaid = invoice.paidCentavos - allocation.amountCentavos;
        await transaction.update(invoices).set({ paidCentavos: nextPaid, status: invoiceSettlementStatus(nextPaid, invoice.totalCentavos) }).where(eq(invoices.id, invoice.id));
      }
      const reversedAt = new Date();
      await transaction.update(subscriberCredits).set({ remainingCentavos: 0n, status: "REVERSED", reversedAt, updatedAt: reversedAt }).where(eq(subscriberCredits.sourcePaymentId, paymentId));
      await transaction.update(paymentAllocations).set({ isReversed: true, reversedAt }).where(eq(paymentAllocations.paymentId, paymentId));
      await transaction.update(payments).set({ status: "REVERSED", reversedAt }).where(eq(payments.id, paymentId));
      await transaction.update(receipts).set({ voidedAt: reversedAt }).where(eq(receipts.paymentId, paymentId));
      await transaction.insert(ledgerEntries).values({ sequenceNumber: await nextSequence(transaction, "LEDGER"), subscriberId: payment.subscriberId, paymentId, type: "PAYMENT_REVERSAL_DEBIT", description: `Reversal of ${payment.paymentNumber}`, debitCentavos: payment.amountCentavos, actorUserId: actor.userId });
      const reversalNumber = `REV-${(await nextSequence(transaction, "PAYMENT_REVERSAL")).toString().padStart(8, "0")}`;
      const [reversal] = await transaction.insert(paymentReversals).values({ reversalNumber, paymentId, reason: reason.trim(), reversedBy: actor.userId }).returning();
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "payment.reverse", entityType: "payment", entityId: paymentId, requestId: actor.requestId ?? null, afterValues: { reversalNumber, reason: reason.trim(), amountCentavos: payment.amountCentavos.toString() } });
      return reversal;
    });
  }

  private openInvoices(database: Pick<BcisDatabase, "select">, subscriberId: string, lock = false, serviceAccountId?: string) {
    const query = database.select().from(invoices).where(and(eq(invoices.subscriberId, subscriberId), inArray(invoices.status, ["OPEN", "PARTIALLY_PAID"]), serviceAccountId ? eq(invoices.serviceAccountId, serviceAccountId) : undefined)).orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber));
    return lock && "for" in query ? query.for("update") : query;
  }

  private async resultForPayment(database: Pick<BcisDatabase, "select">, paymentId: string) {
    const [row] = await database.select({ payment: payments, receipt: receipts }).from(payments).leftJoin(receipts, eq(receipts.paymentId, payments.id)).where(eq(payments.id, paymentId)).limit(1);
    if (!row) throw new AppError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
    const allocations = await database.select({ allocation: paymentAllocations, invoiceNumber: invoices.invoiceNumber }).from(paymentAllocations).innerJoin(invoices, eq(paymentAllocations.invoiceId, invoices.id)).where(eq(paymentAllocations.paymentId, paymentId));
    const [credit] = await database.select().from(subscriberCredits).where(eq(subscriberCredits.sourcePaymentId, paymentId)).limit(1);
    return { payment: serializePayment(row.payment), receipt: row.receipt ? { ...row.receipt, snapshot: row.receipt.snapshot } : null, allocations: allocations.map((row) => ({ invoiceNumber: row.invoiceNumber, amountCentavos: row.allocation.amountCentavos.toString(), fromCredit: row.allocation.fromCredit, isReversed: row.allocation.isReversed })), advanceCreditCentavos: credit?.originalCentavos.toString() ?? "0", remainingCreditCentavos: credit?.remainingCentavos.toString() ?? "0" };
  }
}

type PaymentTransaction = Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0];

async function nextSequence(transaction: PaymentTransaction, code: string): Promise<bigint> {
  const [sequence] = await transaction.insert(numberSequences).values({ code, lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue });
  if (!sequence) throw new Error(`${code} number generation failed.`);
  return sequence.value;
}

function serializePayment(payment: typeof payments.$inferSelect) {
  return { ...payment, amountCentavos: payment.amountCentavos.toString() };
}

function decodeProofImage(imageBase64: string, originalFileName: string): { bytes: Buffer; mediaType: "image/png" | "image/jpeg" } {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) throw new AppError(400, "INVALID_GCASH_PROOF", "The proof image must be valid base64.");
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.toString("base64") !== imageBase64 || bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new AppError(400, "INVALID_GCASH_PROOF", "The proof image must be at most 2 MiB.");
  const png = bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR";
  const jpeg = bytes.length >= 6 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (png && /.png$/i.test(originalFileName)) return { bytes, mediaType: "image/png" };
  if (jpeg && /.jpe?g$/i.test(originalFileName)) return { bytes, mediaType: "image/jpeg" };
  throw new AppError(400, "INVALID_GCASH_PROOF", "The proof must be a JPEG or PNG image matching its file name.");
}
