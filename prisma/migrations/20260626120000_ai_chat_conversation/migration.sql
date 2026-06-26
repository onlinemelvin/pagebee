-- AI live-chat support on Conversation: a per-thread public session token (the widget reads/posts
-- only its own thread), AI-captured visitor contact, and escalation/timeout bookkeeping that drives
-- the owner alert + the timeout sweep. See docs/MESSAGING.md.

ALTER TABLE "conversations"
  ADD COLUMN "publicToken" TEXT,
  ADD COLUMN "visitorName" TEXT,
  ADD COLUMN "visitorEmail" TEXT,
  ADD COLUMN "visitorPhone" TEXT,
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalationNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastCustomerAt" TIMESTAMP(3),
  ADD COLUMN "lastOwnerAt" TIMESTAMP(3),
  ADD COLUMN "timedOutAt" TIMESTAMP(3);

-- New chats start in the 'ai' state (was 'open').
ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'ai';

CREATE UNIQUE INDEX "conversations_publicToken_key" ON "conversations"("publicToken");

CREATE INDEX "conversations_status_escalatedAt_idx" ON "conversations"("status", "escalatedAt");
