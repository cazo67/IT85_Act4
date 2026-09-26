CREATE TYPE "public"."batch_account_status" AS ENUM('PENDING', 'PARTIAL', 'COLLECTED');--> statement-breakpoint
CREATE TYPE "public"."collection_batch_status" AS ENUM('DRAFT', 'ACTIVE', 'SUBMITTED', 'RECONCILED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "batch_collection_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_account_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_collection_entries_amount_chk" CHECK ("batch_collection_entries"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "batch_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"expected_centavos" bigint NOT NULL,
	"collected_cash_centavos" bigint NOT NULL,
	"remitted_cash_centavos" bigint NOT NULL,
	"non_cash_centavos" bigint NOT NULL,
	"difference_centavos" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reconciled_by" uuid,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_reconciliations_balanced_chk" CHECK ("batch_reconciliations"."difference_centavos" = 0 and "batch_reconciliations"."remitted_cash_centavos" = "batch_reconciliations"."collected_cash_centavos")
);
--> statement-breakpoint
CREATE TABLE "collection_batch_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"account_number_snapshot" text NOT NULL,
	"subscriber_name_snapshot" text NOT NULL,
	"service_number_snapshot" text NOT NULL,
	"expected_centavos" bigint NOT NULL,
	"collected_centavos" bigint DEFAULT 0 NOT NULL,
	"status" "batch_account_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batch_accounts_amounts_chk" CHECK ("collection_batch_accounts"."expected_centavos" >= 0 and "collection_batch_accounts"."collected_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collection_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" text NOT NULL,
	"collector_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"collection_date" date NOT NULL,
	"status" "collection_batch_status" DEFAULT 'DRAFT' NOT NULL,
	"expected_cash_centavos" bigint DEFAULT 0 NOT NULL,
	"collected_cash_centavos" bigint DEFAULT 0 NOT NULL,
	"non_cash_centavos" bigint DEFAULT 0 NOT NULL,
	"remitted_cash_centavos" bigint DEFAULT 0 NOT NULL,
	"difference_centavos" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batches_nonnegative_chk" CHECK ("collection_batches"."expected_cash_centavos" >= 0 and "collection_batches"."collected_cash_centavos" >= 0 and "collection_batches"."non_cash_centavos" >= 0 and "collection_batches"."remitted_cash_centavos" >= 0),
	CONSTRAINT "collection_batches_difference_chk" CHECK ("collection_batches"."difference_centavos" = "collection_batches"."remitted_cash_centavos" - "collection_batches"."collected_cash_centavos")
);
--> statement-breakpoint
CREATE TABLE "collector_remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remittance_number" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"remitted_cash_centavos" bigint NOT NULL,
	"difference_centavos" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"remitted_by" uuid,
	"remitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_remittances_cash_chk" CHECK ("collector_remittances"."remitted_cash_centavos" >= 0)
);
--> statement-breakpoint
ALTER TABLE "batch_collection_entries" ADD CONSTRAINT "batch_collection_entries_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_collection_entries" ADD CONSTRAINT "batch_collection_entries_batch_account_id_collection_batch_accounts_id_fk" FOREIGN KEY ("batch_account_id") REFERENCES "public"."collection_batch_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_collection_entries" ADD CONSTRAINT "batch_collection_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_collection_entries" ADD CONSTRAINT "batch_collection_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_reconciliations" ADD CONSTRAINT "batch_reconciliations_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_reconciliations" ADD CONSTRAINT "batch_reconciliations_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_route_id_collection_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."collection_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_remitted_by_users_id_fk" FOREIGN KEY ("remitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_collection_entries_payment_uidx" ON "batch_collection_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "batch_collection_entries_batch_idx" ON "batch_collection_entries" USING btree ("batch_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_reconciliations_batch_uidx" ON "batch_reconciliations" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batch_accounts_service_uidx" ON "collection_batch_accounts" USING btree ("batch_id","service_account_id");--> statement-breakpoint
CREATE INDEX "collection_batch_accounts_subscriber_idx" ON "collection_batch_accounts" USING btree ("batch_id","subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batches_number_uidx" ON "collection_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batches_collector_route_date_uidx" ON "collection_batches" USING btree ("collector_id","route_id","collection_date");--> statement-breakpoint
CREATE INDEX "collection_batches_status_date_idx" ON "collection_batches" USING btree ("status","collection_date");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_remittances_number_uidx" ON "collector_remittances" USING btree ("remittance_number");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_remittances_batch_uidx" ON "collector_remittances" USING btree ("batch_id");