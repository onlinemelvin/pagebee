import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated/transient artifacts that aren't source we lint.
    "coverage/**",
    ".claude/worktrees/**",
    ".clone/worktrees/**",
  ]),
  {
    // The newest react-hooks plugin ships experimental rules (set-state-in-effect,
    // purity, error-boundaries) that flag many legitimate, intentional patterns
    // (mounted flags, media-query reads, rAF). Keep them as visible WARNINGS
    // rather than hard errors so the pre-commit gate stays meaningful without
    // blocking on a large stylistic backlog. Revisit once the rules stabilize.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/error-boundaries": "warn",
    },
  },
]);

export default eslintConfig;
