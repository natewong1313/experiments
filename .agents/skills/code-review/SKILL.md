---
name: code-review
description: Orchestrates a three-way parallel code review of a change set. Use when the user asks to review a branch, PR, working tree, or diff — especially with phrases like "review this change", "audit my branch", or "run a code review".
---

# Code review

Run three parallel reviewers over one scoped change set, then synthesize their findings into a single report.

## Quick start

"Review my current branch" → determine the diff scope, gather the diff and context, launch three subagents (audit-comments, thermo-nuclear-review, thermo-nuclear-code-quality-review), and synthesize their findings into one prioritized report.

## Workflow

1. **Determine scope.** From the user request, identify what to review: a PR (use the PR's base branch), the current branch (diff against its merge-base with main), or specific changed files. When ambiguous, ask. Record the exact diff command used, e.g. `git diff main...HEAD`.

2. **Gather context for the reviewers.**
   - The diff itself (`git diff` or `git diff --staged`, scoped as decided above).
   - File excerpts around changed regions so reviewers can judge effects without guessing.
   - Relevant surrounding files a change could affect (callers, tests, config).
   Pass the same context to every reviewer so their findings are comparable.

3. **Launch three subagents in parallel.** Subagents are independent; run them concurrently and do not wait on one before launching the next.
   - **Audit comments** subagent: follow the skill at `.agents/skills/audit-comments/SKILL.md`. It audits comments in the diff and rewrites slop in place. This subagent edits files directly and needs no user input or approval — let it finish on its own.
   - **Thermo nuclear review** subagent: follow the skill at `.agents/skills/thermo-nuclear-review/SKILL.md`. Ask it to return prioritized findings on bugs, breakages, security issues, devex regressions, feature-flag leaks, and other branch-audit risks, each with file references and concrete evidence.
   - **Thermo nuclear code quality review** subagent: follow the skill at `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. Ask it to return prioritized findings on maintainability, structure, file-size growth, spaghetti code, abstractions, and codebase-health risks, each with file references and concrete evidence.
   - Give both thermo-nuclear subagents the same scoped diff and file context from step 2, and tell them to report findings only — no edits.

4. **Collect results.** Both thermo-nuclear subagents must finish before synthesis. Read each report fully; do not skim.

5. **Synthesize.** Produce the final report:
   - Findings first, ordered by priority. Keep each summary brief (a sentence or two plus file references).
   - Deduplicate across reviewers: the same underlying issue reported by both thermo-nuclear reviewers appears once, merged, and is weighted more heavily — overlapping findings are stronger evidence.
   - Resolve disagreements with your own judgment: check the actual code before preferring one reviewer's claim over another's, and drop findings you cannot verify.
   - Note separately (briefly, at the end) what the audit-comments subagent changed, if anything.
   - If a reviewer found nothing significant, say so in one line rather than padding the report.

## Judgment

- Scope failures are the most common mistake. If the diff is empty or the merge-base is wrong, stop and ask rather than reviewing the wrong change.
- Never let a reviewer's edits and another reviewer's diff go stale: the audit-comments subagent rewrites comments in place, so if it finishes before you gather the diff for the thermo-nuclear reviewers, re-collect the diff. Launching all three at once with the same snapshot avoids this.
- Do not merge findings that merely touch the same file but describe different problems.
