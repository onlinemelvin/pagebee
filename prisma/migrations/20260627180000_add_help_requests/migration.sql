-- Rep technical-help tickets (admin inbox + email routing).
CREATE TYPE "HelpRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "help_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "repName" TEXT,
    "previewId" TEXT,
    "prospectId" TEXT,
    "message" TEXT NOT NULL,
    "status" "HelpRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "help_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "help_requests_status_idx" ON "help_requests"("status");
