DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "payment_proofs") THEN
    RAISE EXCEPTION 'GCash proof migration requires review of existing proof rows';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "payment_proofs" DROP CONSTRAINT "payment_proofs_size_chk";--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "amount_centavos" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "sender_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "sender_mobile" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "proof_data" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_amount_chk" CHECK ("payment_proofs"."amount_centavos" > 0);--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_mobile_chk" CHECK ("payment_proofs"."sender_mobile" ~ '^09[0-9]{9}$');--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_size_chk" CHECK ("payment_proofs"."size_bytes" > 0 and "payment_proofs"."size_bytes" <= 2097152);
