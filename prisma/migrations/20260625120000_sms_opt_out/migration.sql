-- SMS opt-out suppression list (TCPA STOP compliance). A phone number lands here when the recipient
-- texts STOP (or admin/bounce); it's removed on START. The SMS send path checks this before every
-- message, so a suppressed number is never texted. Keyed globally by E.164 phone. See docs/MESSAGING.md.

CREATE TABLE "sms_opt_outs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "clientId" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_opt_outs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_opt_outs_phone_key" ON "sms_opt_outs"("phone");

CREATE INDEX "sms_opt_outs_clientId_idx" ON "sms_opt_outs"("clientId");
