-- AlterEnum: estimate/quote lifecycle states
ALTER TYPE "InvoiceStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "InvoiceStatus" ADD VALUE 'DECLINED';
ALTER TYPE "InvoiceStatus" ADD VALUE 'EXPIRED';

-- CreateEnum
CREATE TYPE "FinanceDocType" AS ENUM ('ESTIMATE', 'QUOTE', 'INVOICE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable: invoices → unified client→customer document
ALTER TABLE "invoices"
  ADD COLUMN "docType" "FinanceDocType" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "depositAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "terms" TEXT,
  ADD COLUMN "issueDate" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "declinedAt" TIMESTAMP(3),
  ADD COLUMN "convertedFromId" TEXT,
  ADD COLUMN "publicToken" TEXT;

-- AlterTable: invoice line items → per-line discount + tax + ordering
ALTER TABLE "invoice_line_items"
  ADD COLUMN "serviceId" TEXT,
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxRateId" TEXT,
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: finance settings
ALTER TABLE "client_settings" ADD COLUMN "financeSettings" JSONB;

-- CreateTable: tax rates
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rates_clientId_idx" ON "tax_rates"("clientId");

-- Invoice number is now unique per client (not globally).
DROP INDEX "invoices_number_key";
CREATE UNIQUE INDEX "invoices_clientId_number_key" ON "invoices"("clientId", "number");
CREATE UNIQUE INDEX "invoices_convertedFromId_key" ON "invoices"("convertedFromId");
CREATE UNIQUE INDEX "invoices_publicToken_key" ON "invoices"("publicToken");
CREATE INDEX "invoices_clientId_docType_status_idx" ON "invoices"("clientId", "docType", "status");

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: conversion chain (estimate→quote→invoice)
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_convertedFromId_fkey" FOREIGN KEY ("convertedFromId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
