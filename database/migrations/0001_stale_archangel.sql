CREATE TYPE "public"."address_type" AS ENUM('BILLING', 'SERVICE', 'MAILING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('MOBILE', 'PHONE', 'EMAIL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."service_account_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."service_event_type" AS ENUM('CREATED', 'ACTIVATED', 'PLAN_CHANGED', 'ADDRESS_CHANGED', 'SUSPENDED', 'RECONNECTED', 'DISCONNECTED', 'TERMINATED', 'NOTE');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('ACTIVE', 'INACTIVE', 'TERMINATED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"code" text PRIMARY KEY NOT NULL,
	"last_value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"schedule_notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collector_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_id" uuid NOT NULL,
	"route_id" uuid,
	"service_account_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"contact_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_number" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"installation_address_id" uuid NOT NULL,
	"assigned_collector_id" uuid,
	"activation_date" date,
	"billing_start_date" date NOT NULL,
	"billing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"current_rate_centavos" bigint NOT NULL,
	"status" "service_account_status" DEFAULT 'PENDING' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_accounts_days_chk" CHECK ("service_accounts"."billing_day" between 1 and 28 and "service_accounts"."due_day" between 1 and 28),
	CONSTRAINT "service_accounts_rate_nonnegative_chk" CHECK ("service_accounts"."current_rate_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"type" "service_event_type" NOT NULL,
	"description" text NOT NULL,
	"old_status" "service_account_status",
	"new_status" "service_account_status",
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"service_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_centavos" bigint NOT NULL,
	"installation_fee_centavos" bigint DEFAULT 0 NOT NULL,
	"reconnection_fee_centavos" bigint DEFAULT 0 NOT NULL,
	"internet_speed_mbps" integer,
	"cable_channel_count" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_price_nonnegative_chk" CHECK ("service_plans"."price_centavos" >= 0 and "service_plans"."installation_fee_centavos" >= 0 and "service_plans"."reconnection_fee_centavos" >= 0),
	CONSTRAINT "service_plans_speed_channels_positive_chk" CHECK (("service_plans"."internet_speed_mbps" is null or "service_plans"."internet_speed_mbps" > 0) and ("service_plans"."cable_channel_count" is null or "service_plans"."cable_channel_count" > 0))
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"type" "address_type" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"barangay" text NOT NULL,
	"city_municipality" text NOT NULL,
	"province" text NOT NULL,
	"postal_code" text,
	"normalized_search" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"suffix" text,
	"normalized_name" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'ACTIVE' NOT NULL,
	"billing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"collection_area_id" uuid,
	"assigned_collector_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_billing_day_chk" CHECK ("subscribers"."billing_day" between 1 and 28),
	CONSTRAINT "subscribers_due_day_chk" CHECK ("subscribers"."due_day" between 1 and 28)
);
--> statement-breakpoint
ALTER TABLE "collection_routes" ADD CONSTRAINT "collection_routes_area_id_collection_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."collection_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_route_id_collection_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."collection_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_plan_id_service_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."service_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_installation_address_id_subscriber_addresses_id_fk" FOREIGN KEY ("installation_address_id") REFERENCES "public"."subscriber_addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_assigned_collector_id_collectors_id_fk" FOREIGN KEY ("assigned_collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_addresses" ADD CONSTRAINT "subscriber_addresses_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_contacts" ADD CONSTRAINT "subscriber_contacts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_assigned_collector_id_collectors_id_fk" FOREIGN KEY ("assigned_collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_areas_code_uidx" ON "collection_areas" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_routes_code_uidx" ON "collection_routes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "collection_routes_area_idx" ON "collection_routes" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_assignments_active_service_uidx" ON "collector_assignments" USING btree ("service_account_id") WHERE "collector_assignments"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "collector_assignments_collector_idx" ON "collector_assignments" USING btree ("collector_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "collectors_code_uidx" ON "collectors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "collectors_active_idx" ON "collectors" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_number_uidx" ON "service_accounts" USING btree ("service_account_number");--> statement-breakpoint
CREATE INDEX "service_accounts_subscriber_idx" ON "service_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "service_accounts_status_collector_idx" ON "service_accounts" USING btree ("status","assigned_collector_id");--> statement-breakpoint
CREATE INDEX "service_events_account_time_idx" ON "service_events" USING btree ("service_account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_plans_code_uidx" ON "service_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "service_plans_type_active_idx" ON "service_plans" USING btree ("service_type_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_code_uidx" ON "service_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_subscriber_idx" ON "subscriber_addresses" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_search_idx" ON "subscriber_addresses" USING btree ("normalized_search");--> statement-breakpoint
CREATE INDEX "subscriber_contacts_subscriber_idx" ON "subscriber_contacts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriber_contacts_value_idx" ON "subscriber_contacts" USING btree ("normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_account_number_uidx" ON "subscribers" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "subscribers_normalized_name_idx" ON "subscribers" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "subscribers_status_area_idx" ON "subscribers" USING btree ("status","collection_area_id");--> statement-breakpoint
CREATE INDEX "subscribers_collector_idx" ON "subscribers" USING btree ("assigned_collector_id");