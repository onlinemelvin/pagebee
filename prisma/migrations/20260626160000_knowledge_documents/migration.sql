-- AI knowledge base sources: parsed documents (PDF/DOCX/TXT → text) and captioned company images.
-- `text` is what the AI reads; the original file lives in the client-uploads bucket at `url`.
-- Assembled into the AI context (generation + chat) by buildKbContext. See src/lib/modules/knowledge.

CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_documents_clientId_idx" ON "knowledge_documents"("clientId");

ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
