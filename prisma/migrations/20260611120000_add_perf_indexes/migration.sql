-- Performance indexes backing hot dashboard / list / worker queries.
CREATE INDEX IF NOT EXISTS "leads_clientId_createdAt_idx" ON "leads"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "bookings_clientId_status_idx" ON "bookings"("clientId", "status");
CREATE INDEX IF NOT EXISTS "previews_clientId_createdAt_idx" ON "previews"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "website_generation_jobs_status_createdAt_idx" ON "website_generation_jobs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "notification_events_clientId_event_idx" ON "notification_events"("clientId", "event");
