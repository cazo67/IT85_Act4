CREATE INDEX "audit_logs_action_time_idx" ON "audit_logs" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_time_idx" ON "audit_logs" USING btree ("occurred_at");