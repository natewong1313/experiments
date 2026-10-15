---
name: writing-comments
description: Writes and revises code comments in a formal, declarative voice using Simplified Technical English. Use when adding or editing comments or docstrings, or reviewing comment wording.
---

# Writing comments

Use a formal, declarative voice. State the behavior or constraint, then explain its effect when needed. Write comments as technical documentation.

## Quick start

Prefer this tone:

```text
/**
 * Subscribers skip actions at or below their channel's revision. This prevents a second action
 * on the same channel with the same revision from being delivered.
 */
```

Over this conversational explanation:

```text
/**
 * Subscribers skip actions at or below their channel's revision, so a second action on the
 * same channel with the same revision would never be delivered.
 */
```

The preference concerns tone and sentence structure. Preserve the original technical meaning when rewriting.

## Voice

- State established behavior in the simple present tense. Prefer a direct statement followed by a separate sentence explaining its effect.
- Use an impersonal, factual tone. Omit conversational openings, rhetorical questions, and references to "we" or "you".
- Name the component that performs the action. Prefer active voice. Passive voice is acceptable when the actor is unknown or unimportant.
- Use "This prevents" when prevention is the actual effect. Describe a limitation or failure directly when that is the relevant fact.
- Preserve conditions, uncertainty, and scope. Keep "if", "can", "may", or "would" when the meaning requires them. A declarative tone does not justify stronger claims.
- Use an imperative only when the comment gives an instruction to a maintainer.

## Simplified Technical English

Use ASD-STE100 Simplified Technical English for comment prose. Treat explanations as descriptive writing and maintenance instructions as procedural writing.

- Use short, complete sentences with one main idea. For this repo, limit descriptive sentences to 25 words and instructions to 20 words.
- Keep subjects, verbs, and necessary articles. Split long sentences instead of compressing them into fragments or symbols.
- Use simple verb forms and literal language. Put a condition before the behavior it controls when this makes the scope clear.
- Use the same term for the same concept. Preserve code identifiers and established project terminology as technical terms.
- Use approved general words with their approved meanings and parts of speech when checking against the STE dictionary. Retain necessary technical nouns and verbs.
- Use the [official ASD-STE100 reference](https://www.asd-ste100.org/about_STE.html) and its linked standard when resolving STE questions. This summary does not replace the full rules and dictionary. Claim full compliance only after checking both.

## Unslop rules for comments

Apply these rules from the repo's unslop guidance:

- State concrete behavior, constraints, or reasons. Replace vague claims such as "handles edge cases" or "ensures robustness" with the specific fact.
- Prefer plain words. Use "use" instead of "utilize" or "leverage", and "to" instead of "in order to".
- Remove filler such as "Note that" and "It is important to note". Keep qualifications that affect correctness.
- Replace metaphors, personification, and decorative phrasing with literal descriptions. Name the mechanism instead of calling it a "gatekeeper" or "backbone".
- Remove superficial phrases such as "ensuring consistency" unless they identify a concrete consequence that the comment needs to explain.
- Keep terminology consistent. Avoid synonym changes for variety and forced lists of three.
- Use periods and commas for sentence structure. Omit em dashes, curly quotes, decorative symbols, and rhetorical fragments.

## Workflow

1. Read the surrounding code. Identify the fact a maintainer needs, such as a constraint, non-obvious reason, or external requirement.
2. Add or retain a comment only when it supplies useful information beyond the code. Preserve relevant links, issue IDs, exact values, and conditions.
3. Write or revise the comment using the voice and language rules above. Preserve documentation tags and tool directives.
4. Check each claim against the implementation or its cited source. Remove unsupported claims and confirm that the rewrite preserves the meaning.
