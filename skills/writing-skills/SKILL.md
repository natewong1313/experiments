---
name: writing-skills
description: Creates and revises agent skills with concise instructions and any needed references or scripts. Use when a user asks to write, convert, draft, or improve a skill or SKILL.md.
---

# Writing skills

## Quick start

For a request such as "Turn this workflow into a skill," identify the task the skill should handle, write `skill-name/SKILL.md`, check the draft, and show it to the user for review. A short skill needs no other files.

## Workflow

1. Gather the requirements. Ask what task or domain the skill covers, which use cases matter, whether it needs executable scripts or only instructions, and what reference material to include. Use information already supplied by the user or project; ask only for details that would change the draft. If a detail remains open, state the assumption and continue with a reviewable draft.
2. Choose a short, lowercase, hyphenated name. Put the skill in the location the user requests. If the project has a skills directory and the user asks for a project skill, use that directory.
3. Write `SKILL.md` with YAML frontmatter containing `name` and `description`. The description must be under 1024 characters, use third person, state the capability in its first sentence, and start its second sentence with "Use when" followed by specific triggers.
4. Keep the main file under 100 lines. Include a quick start with a concrete example and a workflow for tasks that need multiple steps. Add advanced guidance only when it helps the skill perform its stated task.
5. Add a separate reference when the main file would exceed 100 lines, a topic needs substantial detail, or advanced material is rarely needed. Link each reference directly from `SKILL.md` and keep links one level deep. Add examples only when they clarify a decision the instructions do not cover.
6. Add a script when an operation is deterministic, repeated code would otherwise be regenerated, or explicit error handling makes the task more reliable. Run new or changed scripts to verify them. Do not add placeholder files or directories.
7. Review the draft for specific triggers, stable information, consistent terms, a concrete example, working reference links, and the requested scope. Validate frontmatter and structure with an available skill validator when practical.
8. Present the draft or its location to the user and ask whether it covers their use cases, what is missing or unclear, and which sections need more or less detail. Apply their feedback.

## File layout

```text
skill-name/
├── SKILL.md
├── REFERENCE.md   # Only when detailed guidance is needed
├── EXAMPLES.md    # Only when examples aid decisions
└── scripts/       # Only when repeatable code is needed
```

Keep references beside `SKILL.md` or in a `references/` directory, according to the project's convention. Link to the actual path from the main file.
