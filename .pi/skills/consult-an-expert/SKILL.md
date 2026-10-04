---
name: consult-an-expert
description: After a turn where code was written or changed that uses a third-party library or module (anything from node_modules, pip, cargo, go modules, etc. — not this project's own code and not the language standard library), spawn a subagent that obtains a local checkout of that library under ~/dev/reference-repos (cloning via the context7 MCP when not present), studies its docs, conventions, and examples, and audits your usage against them. Use after any such turn, before declaring the work done.
---

# Consult an Expert

When you write code against a third-party library, you are guessing at its API from memory or fragments of docs. This skill replaces the guess with a source-grounded review: a fresh-context subagent reads the library's own repository — README, docs, examples, tests, and source — then audits the code you just wrote against what it learned.

## Scope

A **third-party library** is anything imported/required from outside this project that is not part of the language's standard library. Examples: `npm`/`pnpm` packages, `pip` packages, crates, Go modules.

Run this skill once per turn that introduced or changed third-party usage, covering **each distinct library**. If several libraries were used, handle them in one fanout of parallel subagents (one per library) rather than one child doing everything.

Do not run it for: the project's own packages/modules, language standard library only, or config file edits that don't call library code.

## Procedure

1. **Identify the libraries** used in the code just written and the **project files** that touch them. Collect the actual usage snippets (imports + call sites) to pass along.
2. **Ensure delegation is available** (`subagents_enable` if not already active), then launch **one subagent per library** with the prompt from [references/expert-subagent-prompt.md](references/expert-subagent-prompt.md), filled in with:
   - `{LIBRARY}` — package name (and version from the lockfile if known)
   - `{REPO_DIR}` — project path (use the current project root)
   - `{FILES}` — the project files using the library
   - `{USAGE}` — the relevant snippets
     Launch async by default; yield after launching and let Pi wake you on completion. The child needs `bash`, `read`, grep/search, and `mcp` (for context7) in its tool allowlist — it must be read-only with respect to project files.
3. **Triage the report when each child returns.** The parent keeps fix authority: apply warranted corrections yourself in a follow-up pass, citing the child's evidence. Do not let the child edit project code. If fixes change how the library is used in a meaningful way, re-audit just the delta.
4. **Report to the user**: a one-line verdict per library, then findings worth acting on, then what you fixed.

The subagent's job, in brief (full prompt in the reference file):

- **Get a local checkout.** Look for one under `~/dev/reference-repos/*` (match by name, case-insensitive). If absent, find the GitHub repository URL via the context7 MCP server (or package-registry metadata as a fallback), then `git clone` it into `~/dev/reference-repos/`. Never guess a URL.
- **Analyze** the checkout: README, docs, examples, tests, and the source of the APIs actually used. Note best practices, conventions, what idiomatic example code looks like, and deprecations/pitfalls.
- **Audit** the project's usage against those notes and return a structured, evidence-cited report.

## Rules

- The child clones **reference repos only** into `~/dev/reference-repos` — it never clones into, or writes inside, this project.
- Analysis must be bounded: for large libraries, the child focuses on the modules matching the APIs used, not the whole tree.
- Findings require citations (file paths, line references, or doc sections from the library repo). "Feels off" is not a finding.
- If the library's repo cannot be found through context7 or registry metadata, the child stops and reports that; the parent asks the user rather than proceeding on guesses.
