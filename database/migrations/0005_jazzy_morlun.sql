CREATE TYPE "public"."credit_status" AS ENUM('AVAILABLE', 'CONSUMED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'GCASH');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('POSTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."payment_proof_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'PAYMENT_CREDIT' BEFORE 'ADJUSTMENT_DEBIT';--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'PAYMENT_REVERSAL_DEBIT' BEFORE 'ADJUSTMENT_DEBIT';--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_positive_chk" CHECK ("payment_allocations"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"external_reference" text NOT NULL,
	"normalized_external_reference" text NOT NULL,
	"original_file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "payment_proof_status" DEFAULT 'PENDING' NOT NULL,
	"uploaded_by" uuid,
	"reviewed_by" uuid,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_size_chk" CHECK ("payment_proofs"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reversal_number" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reversed_by" uuid,
	"reversed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reversals_reason_chk" CHECK (length(trim("payment_reversals"."reason")) >= 10)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_number" text NOT NULL,
	"command_key" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"external_reference" text,
	"normalized_external_reference" text,
	"status" "payment_status" DEFAULT 'POSTED' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" uuid,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive_chk" CHECK ("payments"."amount_centavos" > 0),
	CONSTRAINT "payments_reference_chk" CHECK (("payments"."method" = 'CASH' and "payments"."normalized_external_reference" is null) or ("payments"."method" = 'GCASH' and "payments"."normalized_external_reference" is not null))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriber_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"source_payment_id" uuid NOT NULL,
	"original_centavos" bigint NOT NULL,
	"remaining_centavos" bigint NOT NULL,
	"status" "credit_status" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_credits_values_chk" CHECK ("subscriber_credits"."original_centavos" > 0 and "subscriber_credits"."remaining_centavos" >= 0 and "subscriber_credits"."remaining_centavos" <= "subscriber_credits"."original_centavos")
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amounts_chk";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_centavos" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_payment_invoice_uidx" ON "payment_allocations" USING btree ("payment_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_reference_uidx" ON "payment_proofs" USING btree ("normalized_external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_storage_key_uidx" ON "payment_proofs" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "payment_proofs_status_time_idx" ON "payment_proofs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reversals_number_uidx" ON "payment_reversals" USING btree ("reversal_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reversals_payment_uidx" ON "payment_reversals" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_number_uidx" ON "payments" USING btree ("payment_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_command_uidx" ON "payments" USING btree ("command_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gcash_reference_uidx" ON "payments" USING btree ("normalized_external_reference") WHERE "payments"."method" = 'GCASH' and "payments"."normalized_external_reference" is not null;--> statement-breakpoint
CREATE INDEX "payments_subscriber_time_idx" ON "payments" USING btree ("subscriber_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_uidx" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_payment_uidx" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_credits_source_uidx" ON "subscriber_credits" USING btree ("source_payment_id");--> statement-breakpoint
CREATE INDEX "subscriber_credits_subscriber_idx" ON "subscriber_credits" USING btree ("subscriber_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_payment_type_uidx" ON "ledger_entries" USING btree ("payment_id","type");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_chk" CHECK ("invoices"."subtotal_centavos" > 0 and "invoices"."total_centavos" > 0 and "invoices"."total_centavos" = "invoices"."subtotal_centavos" and "invoices"."paid_centavos" >= 0 and "invoices"."paid_centavos" <= "invoices"."total_centavos");