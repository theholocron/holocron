---
title: holocron-skill-skill
description: Add a new owned skill to theholocron/skills.
---

Adds a new skill to the `theholocron/skills` registry.

**Invoke as:** `/holocron-skill-skill`

**Trigger:** user asks to create or add a new skill to the skills repo.

## What it produces

A new `skills/<name>/` directory with a `SKILL.md` file in the standard frontmatter format:

```markdown
---
name: <name>
description: <one-line description>. INVOKE WHEN: <trigger condition>.
---

# <name>

...skill content...
```

## Categories

**Workflow & safety** — generic skills applicable to any repo (e.g. `git-safety`, `commit-standards`).

**Project-specific** — skills scoped to a particular theholocron repo or task (e.g. `holocron-skill-config`).

The category determines which section of `README.md` the skill is listed under.

## After creating

- Add the skill to `README.md` in the appropriate section
- Register it in any consuming repos via `npx skills add @theholocron/skills`
