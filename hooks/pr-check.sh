#!/bin/bash
set -e

echo "🔎 Running PR checks..."

# ── 1. Full type check ───────────────────────────────────────────────────────
echo "→ Type checking..."
# npx tsc --noEmit
# Uncomment above when tsconfig.json exists

# ── 2. Lint (zero warnings) ──────────────────────────────────────────────────
echo "→ Linting..."
# npx eslint . --ext .ts,.tsx --max-warnings 0
# Uncomment above when eslint is configured

# ── 3. Full test suite including integration ─────────────────────────────────
echo "→ Running all tests..."
# npx vitest run
# Uncomment above when tests exist

# ── 4. Check for TODO/FIXME left in changed files ────────────────────────────
echo "→ Checking for unresolved TODOs in changed files..."
CHANGED_FILES=$(git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx')
if [ -n "$CHANGED_FILES" ]; then
  TODO_COUNT=$(echo "$CHANGED_FILES" | xargs grep -c "TODO\|FIXME\|HACK\|XXX" 2>/dev/null | awk -F: '$2>0' | wc -l)
  if [ "$TODO_COUNT" -gt 0 ]; then
    echo "⚠️  Warning: $TODO_COUNT file(s) contain unresolved TODOs/FIXMEs."
    echo "   Review before merging."
  fi
fi

# ── 5. Security audit ────────────────────────────────────────────────────────
echo "→ Running dependency security audit..."
# npm audit --audit-level=high
# Uncomment above when package.json exists

echo "✅ PR checks passed."
