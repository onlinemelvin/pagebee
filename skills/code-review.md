---
name: code-review
description: Code review a pull request. Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Dispatches parallel review agents for bugs, logic errors, and CLAUDE.md compliance.
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*)
---

# Code Review

Provide a thorough code review for the given pull request or code changes.

**Agent assumptions (applies to all agents and subagents):**
- All tools are functional and will work without error. Do not test tools or make exploratory calls.
- Only call a tool if it is required to complete the task. Every tool call should have a clear purpose.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing a major feature
- Before merging to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing a complex bug

## How to Get Git SHAs

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

## Review Process

Follow these steps precisely:

1. **Check PR status** — Confirm the pull request is open, not a draft, not trivial, and hasn't already been reviewed by Claude.

2. **Gather CLAUDE.md context** — Identify and load the root CLAUDE.md and any CLAUDE.md files in directories modified by the PR.

3. **Summarize changes** — View the PR and produce a plain-language summary of what was changed and why.

4. **Run 4 parallel review agents:**

   - **Agents 1 + 2: CLAUDE.md compliance (Sonnet)** — Audit changes for compliance in parallel. Only apply CLAUDE.md files that share a path with the modified file or its parents.

   - **Agent 3: Bug scan (Opus)** — Scan the diff for obvious bugs. Focus on the diff itself. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that require context outside the diff.

   - **Agent 4: Logic/security scan (Opus)** — Look for problems in the introduced code: security issues, incorrect logic, etc. Only within the changed code.

   **CRITICAL: Only HIGH SIGNAL issues.** Flag issues where:
   - Code will fail to compile or parse (syntax errors, type errors, missing imports)
   - Code will definitely produce wrong results regardless of inputs (clear logic errors)
   - Clear, unambiguous CLAUDE.md violations where you can quote the exact rule being broken

   Do NOT flag:
   - Code style or quality concerns
   - Potential issues that depend on specific inputs or state
   - Subjective suggestions or improvements

5. **Validate flagged issues** — For each issue found by Agents 3 and 4, launch a parallel subagent to confirm it is real with high confidence. Use Opus for bugs and logic issues, Sonnet for CLAUDE.md violations.

6. **Filter to validated issues only** — Discard anything not confirmed.

7. **Output summary** — List each confirmed issue with a brief description. If no issues, state: "No issues found. Checked for bugs and CLAUDE.md compliance."

   If `--comment` is NOT provided, stop here.
   If `--comment` IS provided, post a comment via `gh pr comment`.

8. **Post inline comments** — For each issue:
   - Provide a brief description
   - For small, self-contained fixes: include a committable suggestion block
   - For larger fixes (6+ lines, structural, multi-location): describe issue and fix without a suggestion block
   - Post only ONE comment per unique issue

## False Positives — Do NOT Flag

- Pre-existing issues not introduced by this PR
- Something that appears to be a bug but is actually correct
- Pedantic nitpicks that a senior engineer would not flag
- Issues a linter will catch
- General code quality concerns (e.g., lack of test coverage) unless explicitly required in CLAUDE.md
- CLAUDE.md issues explicitly silenced in code (e.g., lint ignore comment)

## Notes

- Use `gh` CLI for GitHub interactions. Do not use web fetch.
- Create a todo list before starting.
- Cite and link each issue in inline comments.
- When linking to code, use the format:
  `https://github.com/OWNER/REPO/blob/FULL_SHA/path/to/file.ts#L10-L15`
  - Requires full git SHA (not a branch name)
  - `#` sign after file name, line range as `L[start]-L[end]`
  - Provide at least 1 line of context before and after

## No Issues Comment Format

```markdown
## Code review

No issues found. Checked for bugs and CLAUDE.md compliance.
```
