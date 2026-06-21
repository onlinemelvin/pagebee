import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests run in a plain node environment against pure, dependency-light
// modules (money math, authz feature gates, signing-secret resolution). DB- and
// network-touching code is intentionally out of scope for this smoke suite.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
