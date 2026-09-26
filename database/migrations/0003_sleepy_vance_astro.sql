CREATE TYPE "public"."billing_cycle_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('PLAN_SERVICE', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('OPEN', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('INVOICE_DEBIT', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT', 'VOID_CREDIT');--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_cycles_period_key_chk" CHECK ("billing_cycles"."period_key" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "billing_cycles_dates_chk" CHECK ("billing_cycles"."period_start" <= "billing_cycles"."period_end")
);
--> statement-breakpoint
CREATE TABLE "billing_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_key" text NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"response_payload" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_centavos" bigint NOT NULL,
	"total_centavos" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_values_chk" CHECK ("invoice_items"."quantity" > 0 and "invoice_items"."unit_amount_centavos" >= 0 and "invoice_items"."total_centavos" = "invoice_items"."quantity" * "invoice_items"."unit_amount_centavos")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'OPEN' NOT NULL,
	"subtotal_centavos" bigint NOT NULL,
	"total_centavos" bigint NOT NULL,
	"plan_code_snapshot" text NOT NULL,
	"plan_name_snapshot" text NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amounts_chk" CHECK ("invoices"."subtotal_centavos" >= 0 and "invoices"."total_centavos" >= 0 and "invoices"."total_centavos" = "invoices"."subtotal_centavos")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_number" bigint NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid,
	"invoice_id" uuid,
	"type" "ledger_entry_type" NOT NULL,
	"description" text NOT NULL,
	"debit_centavos" bigint DEFAULT 0 NOT NULL,
	"credit_centavos" bigint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	CONSTRAINT "ledger_entries_exclusive_amount_chk" CHECK (("ledger_entries"."debit_centavos" > 0 and "ledger_entries"."credit_centavos" = 0) or ("ledger_entries"."credit_centavos" > 0 and "ledger_entries"."debit_centavos" = 0))
);
--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_idempotency" ADD CONSTRAINT "billing_idempotency_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_idempotency" ADD CONSTRAINT "billing_idempotency_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_period_uidx" ON "billing_cycles" USING btree ("period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_idempotency_command_uidx" ON "billing_idempotency" USING btree ("command_key");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uidx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_service_cycle_uidx" ON "invoices" USING btree ("service_account_id","billing_cycle_id");--> statement-breakpoint
CREATE INDEX "invoices_subscriber_date_idx" ON "invoices" USING btree ("subscriber_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_sequence_uidx" ON "ledger_entries" USING btree ("sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_invoice_type_uidx" ON "ledger_entries" USING btree ("invoice_id","type");--> statement-breakpoint
CREATE INDEX "ledger_entries_subscriber_time_idx" ON "ledger_entries" USING btree ("subscriber_id","occurred_at","id");