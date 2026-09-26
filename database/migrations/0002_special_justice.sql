CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DROP INDEX "subscriber_addresses_search_idx";--> statement-breakpoint
DROP INDEX "subscriber_contacts_value_idx";--> statement-breakpoint
DROP INDEX "subscribers_normalized_name_idx";--> statement-breakpoint
CREATE INDEX "subscriber_addresses_search_idx" ON "subscriber_addresses" USING gin ("normalized_search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "subscriber_contacts_value_idx" ON "subscriber_contacts" USING gin ("normalized_value" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "subscribers_normalized_name_idx" ON "subscribers" USING gin ("normalized_name" gin_trgm_ops);
