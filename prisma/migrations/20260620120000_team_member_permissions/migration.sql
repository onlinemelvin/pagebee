-- Per-member capability keys for client team members (e.g. "inquiries:view", "finance:manage").
-- Owners hold every capability implicitly, so their array stays empty.
ALTER TABLE "client_users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "client_user_invites" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
