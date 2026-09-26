CREATE TYPE "public"."service_control_status" AS ENUM('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "reconnection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"suspension_id" uuid NOT NULL,
	"qualifying_payment_id" uuid,
	"reason" text NOT NULL,
	"status" "service_control_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"decision_notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconnection_records_reason_chk" CHECK (length(trim("reconnection_records"."reason")) >= 10)
);
--> statement-breakpoint
CREATE TABLE "suspension_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"outstanding_centavos_snapshot" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "service_control_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"decision_notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suspension_records_reason_chk" CHECK (length(trim("suspension_records"."reason")) >= 10),
	CONSTRAINT "suspension_records_amount_chk" CHECK ("suspension_records"."outstanding_centavos_snapshot" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_suspension_id_suspension_records_id_fk" FOREIGN KEY ("suspension_id") REFERENCES "public"."suspension_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_qualifying_payment_id_payments_id_fk" FOREIGN KEY ("qualifying_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconnection_records_open_service_uidx" ON "reconnection_records" USING btree ("service_account_id") WHERE "reconnection_records"."status" in ('REQUESTED', 'APPROVED');--> statement-breakpoint
CREATE INDEX "reconnection_records_status_time_idx" ON "reconnection_records" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suspension_records_open_service_uidx" ON "suspension_records" USING btree ("service_account_id") WHERE "suspension_records"."status" in ('REQUESTED', 'APPROVED');--> statement-breakpoint
CREATE INDEX "suspension_records_status_time_idx" ON "suspension_records" USING btree ("status","requested_at");