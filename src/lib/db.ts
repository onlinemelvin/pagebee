import { PrismaClient } from "@prisma/client";

// Single Prisma instance reused across hot reloads in dev (avoids exhausting
// connections). See docs/ARCHITECTURE.md §11 for the pooled vs direct URL split.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
