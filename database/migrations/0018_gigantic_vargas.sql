CREATE TABLE "invoice_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"voided_by" uuid,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_voids_reason_chk" CHECK (length(trim("invoice_voids"."reason")) between 10 and 500)
);
--> statement-breakpoint
CREATE TABLE "remittance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remittance_id" uuid NOT NULL,
	"corrected_cash_centavos" bigint NOT NULL,
	"reason" text NOT NULL,
	"corrected_by" uuid,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remittance_corrections_amount_chk" CHECK ("remittance_corrections"."corrected_cash_centavos" >= 0),
	CONSTRAINT "remittance_corrections_reason_chk" CHECK (length(trim("remittance_corrections"."reason")) between 10 and 500)
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_reference_chk";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "other_description" text;--> statement-breakpoint
ALTER TABLE "invoice_voids" ADD CONSTRAINT "invoice_voids_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_voids" ADD CONSTRAINT "invoice_voids_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_corrections" ADD CONSTRAINT "remittance_corrections_remittance_id_collector_remittances_id_fk" FOREIGN KEY ("remittance_id") REFERENCES "public"."collector_remittances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_corrections" ADD CONSTRAINT "remittance_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_voids_invoice_uidx" ON "invoice_voids" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_corrections_remittance_uidx" ON "remittance_corrections" USING btree ("remittance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_other_method_reference_uidx" ON "payments" USING btree ("method","normalized_external_reference") WHERE "payments"."method" in ('BANK_TRANSFER', 'CHEQUE', 'OTHER');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_chk" CHECK (("payments"."method" = 'CASH' and "payments"."external_reference" is null and "payments"."normalized_external_reference" is null and "payments"."other_description" is null) or ("payments"."method" in ('GCASH', 'BANK_TRANSFER', 'CHEQUE') and "payments"."external_reference" is not null and "payments"."normalized_external_reference" is not null and "payments"."other_description" is null) or ("payments"."method" = 'OTHER' and "payments"."external_reference" is not null and "payments"."normalized_external_reference" is not null and "payments"."other_description" is not null and length(trim("payments"."other_description")) between 10 and 200));
