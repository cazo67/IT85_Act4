CREATE TYPE "public"."backup_status" AS ENUM('RUNNING', 'CREATED', 'VERIFIED', 'FAILED', 'RESTORED');--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "backup_status" DEFAULT 'RUNNING' NOT NULL,
	"backup_directory" text NOT NULL,
	"database_file" text NOT NULL,
	"manifest_file" text NOT NULL,
	"size_bytes" bigint,
	"sha256" text,
	"financial_snapshot" jsonb,
	"verification_message" text,
	"created_by" uuid,
	"verified_by" uuid,
	"restored_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_restored_by_users_id_fk" FOREIGN KEY ("restored_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_runs_status_started_idx" ON "backup_runs" USING btree ("status","started_at");