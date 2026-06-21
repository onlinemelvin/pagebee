-- Replace the GLOBAL unique on sending_domains.domain with a per-client scoped
-- unique (clientId, domain). The global unique allowed one tenant's
-- provisionSendingDomain upsert to rewrite clientId and hijack another tenant's
-- sending-domain row; scoping the constraint per client closes that hole.
DROP INDEX IF EXISTS "sending_domains_domain_key";
CREATE UNIQUE INDEX "sending_domains_clientId_domain_key" ON "sending_domains"("clientId", "domain");
