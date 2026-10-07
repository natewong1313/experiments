---
name: implement-this
description: Implements the work described by the user in the current session, without committing unless told to. Then runs a comment audit first, followed by the two review subagents, fixes all findings, and re-reviews until the reviews pass. Finally uses the show-me skill to present the result. Use when the user asks to implement, build, or carry out a described change, or says "implement this".
---

# Implement this

Carry out the work the user described, review it, fix all findings, review again until it passes, and show it back.

## Quick start

"Implement the retry logic we discussed" → read the relevant files, make the changes, run lint and format, then run the review loop from `Review loop` below. When the reviews pass, run the `show-me` skill to present the result.

## Workflow

1. **Confirm the scope.** Restate the requested change in one or two sentences. If the description leaves an open point, state your assumption and continue; do not block on questions unless the change is ambiguous in a way that would waste work.
2. **Read before writing.** Load the files the change touches, plus callers, tests, and config that the change could affect.
3. **Make the changes.** Do exactly the described work. Do not commit unless the user has told you to commit.
4. **Check your changes.** Follow the project's own checks (for this repo: `pnpm run lint` and `pnpm run format`, per `AGENTS.md`). Fix what fails before moving on.
5. **Review loop.** Run the review loop below. It must pass before you finish.
6. **Present.** Run the `show-me` skill (`.agents/skills/show-me/SKILL.md`) to present what you did, then summarize the outcome to the user.

## Review loop

The loop has one full pass and then repeat passes. Each pass reviews the same change set with fresh eyes.

### Pass 1: comment audit, then the two reviewers

Run the subagents in this order. Do not start the reviewers before the audit is done.

1. **Comment audit first.** Spawn a subagent that follows the skill at `.agents/skills/audit-comments/SKILL.md`. It audits the comments in the change set and rewrites the weak ones in place. Give it the diff and any context it needs. Let it finish on its own; it needs no input from you.
2. **Then the two review subagents, in parallel.** Spawn both at the same time, and do not wait on one before starting the other. Give both the same fresh diff (re-collect it after the audit, because the audit may have edited files) and the same file context.
   - **Thermo nuclear review** subagent: follow the skill at `.agents/skills/thermo-nuclear-review/SKILL.md`. It returns prioritized findings on bugs, breakages, security issues, devex regressions, and other risks, with file references and evidence. It reports only; it does not edit.
   - **Thermo nuclear code quality review** subagent: follow the skill at `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`. It returns prioritized findings on maintainability, structure, file-size growth, and codebase-health risks, with file references and evidence. It reports only; it does not edit.

### After each pass: implement the findings

1. Collect all findings from the two review subagents. Deduplicate issues that both reviewers report; treat them as one item.
2. Verify each finding against the actual code before you change anything. Drop findings you cannot reproduce or that do not apply to this change, and say why.
3. Implement every finding you kept.
4. Run the project's own checks again (`pnpm run lint` and `pnpm run format` in this repo). Fix what fails.

### Repeat passes

Run pass 1 again, from the comment audit step, against the updated change set. Keep repeating: implement all findings, then review again, until a pass returns no findings you must fix.

- Use a maximum of three repeat passes. If reviews still find findings after that, stop, summarize what remains, and ask the user how to proceed.
- A pass counts as passed when both reviewers return no findings on this change, or only findings you verified as out of scope.

## Commits

Do not commit unless the user has specifically instructed you to.

If the user has instructed you to commit: commit the changes, then run the review loop after every commit, not only at the end. The loop still needs to pass before you finish.

## Talking to the user

Use simplified technical English (STE-style) in everything you say to the user:

- Keep sentences short. One instruction or fact per sentence.
- Use the active voice: "I changed the file", not "the file was changed".
- Use simple, common words. Say "use" not "utilize", "start" not "initiate".
- Keep the necessary technical terms (file names, commands, function names) as they are.
- Avoid idioms, jokes, and marketing words ("powerful", "seamless", "robust").
- Do not merge sentences with "-ing" clauses. Write "This will fail. Restart the server.", not "This will fail, restarting the server."
