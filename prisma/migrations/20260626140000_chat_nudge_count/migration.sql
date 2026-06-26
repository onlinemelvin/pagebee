-- Proactive "still waiting" reassurances: count how many have been sent on an escalated chat so each
-- fires once. See src/lib/modules/chat (sweepChatEscalations) + docs/MESSAGING.md.

ALTER TABLE "conversations" ADD COLUMN "nudgeCount" INTEGER NOT NULL DEFAULT 0;
