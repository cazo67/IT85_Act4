ALTER TYPE "public"."credit_status" ADD VALUE 'REVERSED';--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "from_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD COLUMN "reversed_at" timestamp with time zone;