import { vi, beforeEach } from "vitest";
import { createPrismaMock } from "./prisma-mock";

/**
 * Global test setup (wired via `setupFiles` in vitest.config.ts).
 *
 * The whole suite runs against a mocked Prisma singleton — no database. Service
 * tests import `prismaMock` from here to stub queries:
 *
 *   import { prismaMock } from "@/test/setup";
 *   prismaMock.lead.create.mockResolvedValue({ id: "l1" });
 *
 * `vi.mock` in a setup file is applied to every test file, so `@/lib/db` is
 * replaced everywhere automatically.
 */
export const prismaMock = createPrismaMock();

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

// Reset call history AND implementations between tests so stubs never leak
// across cases. Each test configures only the calls it exercises.
//
// GOTCHA: resetAllMocks also wipes implementations declared in a `vi.mock(...)`
// FACTORY (e.g. `vi.mock("@/lib/x", () => ({ fn: vi.fn(() => 1) }))`). If a test
// depends on such a factory's RETURN value, re-apply it in a local `beforeEach`
// (`vi.mocked(fn).mockReturnValue(...)`). Setting return values per-test (the
// common case for prismaMock + service/guard mocks) is unaffected.
beforeEach(() => {
  vi.resetAllMocks();
});
