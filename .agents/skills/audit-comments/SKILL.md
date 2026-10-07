---
name: audit-comments
description: Audits every TypeScript comment added in unstaged changes and rewrites the AI-slop ones. Use when reviewing or cleaning up a working tree before commit, when the user asks to check comments for AI tells, or when asked to audit code comments.
---

# Audit comments

Find every comment added in the (unstaged) diff, then audit each one against the unslop skill and rewrite the slop in place.

## Quick start

From the repo root:

```bash
node <this-skill-dir>/scripts/comment-diff.mjs --json
```

Each result is `{ file, line, comment: string[] }`. One-time setup if the script reports a missing parser:

```bash
npm i --prefix ~/.cache/audit-comments typescript@^5
```

Run with `--staged` to audit the staged diff instead. Pass file or directory paths as trailing arguments to scope the audit.

## Workflow

1. Run the script from the repo root and collect every comment.
2. Read the unslop skill at `.agents/skills/unslop/SKILL.md` so its numbered rules are in context.
3. Audit each comment against those rules. Slop in code comments usually takes these forms; rewrite any that match:
   - Stated-purpose filler: "// Highlight the valid entries", "// Ensures the data is loaded", "// Handles edge cases". Say what the line actually does or delete the comment.
   - AI vocabulary and fancy synonyms: "utilize", "leverage", "facilitate", "comprehensive", "seamless", "robust", "crucial", "pivotal".
   - Metaphor and mannered prose: "the single source of truth for...", "acts as a gatekeeper", "the backbone of the flow".
   - Hedging and filler: "Note that", "It is worth noting", "In order to", "potentially".
   - Punctuation tells: em dashes, curly quotes, decorative emojis.
   - Over-compression: symbol-speak or fragments the next reader must decode.
4. Rewrite slop in place with edits to the affected files. Preserve real information: constraints, links, ticket ids, exact values, non-obvious reasoning. If a comment states a concrete fact or a constraint the code cannot express, leave it alone. If a comment adds nothing the code does not already say, delete it instead of rewriting.
5. Re-run the script to confirm the audit covers every reported comment.

## Judgement

- Match the existing voice of the file. Do not impose prose style on terse, mature codebases.
- One clean sentence beats a clever rewrite. Most slop comments become shorter or disappear.
- Never rewrite comment text inside strings, test fixtures with expected output, or generated files.
