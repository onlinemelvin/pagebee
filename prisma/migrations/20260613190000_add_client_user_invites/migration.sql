-- Team support (Automate multi-user): pending invitations to join a client's team.
CREATE TABLE "client_user_invites" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_user_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_user_invites_token_key" ON "client_user_invites"("token");
CREATE INDEX "client_user_invites_clientId_idx" ON "client_user_invites"("clientId");
CREATE INDEX "client_user_invites_email_idx" ON "client_user_invites"("email");

ALTER TABLE "client_user_invites" ADD CONSTRAINT "client_user_invites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
