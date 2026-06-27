import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit + integration tests run in a plain node environment. Services are tested
// against a mocked Prisma singleton (see src/test/setup.ts) — no database — so
// the suite is fast and CI needs no extra infrastructure. We cover business
// logic (src/lib) and API route handlers (src/app/api); React UI is out of scope.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      // Only the layers we test count toward coverage; everything else (React
      // components/pages, generated code, type-only and config files) is excluded
      // so the percentage reflects the logic we actually exercise.
      include: ["src/lib/**", "src/app/api/**"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**",
        "src/**/*.d.ts",
        "src/**/schema.ts", // zod schemas — declarative, no branches to cover
        "src/**/index.ts", // barrel re-exports
      ],
      // Anti-regression ratchet: set just below the level achieved so far
      // (≈68% lines / 83% branches / 78% functions as of the initial suite).
      // CI fails if a change drops coverage below these floors — raise them as
      // coverage grows toward 100%.
      thresholds: {
        lines: 65,
        functions: 75,
        statements: 65,
        branches: 80,
      },
    },
  },
});
