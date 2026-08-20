---
name: holocron-skill-skill
title: "Holocron: New Skill"
description: Add a new owned skill to theholocron/skills. INVOKE WHEN: user asks to create or add a new skill to the skills repo. Invoked as /holocron-skill-skill.
---

<!-- editorconfig-checker-disable-file -->

# Add a new skill

Add a new owned skill to `theholocron/skills`.

Replace `<name>` with the skill's kebab-case identifier (e.g. `git-safety`, `holocron-skill-config`).

---

## 1. Decide the skill category

**Workflow & safety** — generic skills applicable to any repo (e.g. `git-safety`, `commit-standards`).
**Project-specific** — skills scoped to a particular theholocron repo or task (e.g. `holocron-skill-config`).

The category determines which section of `README.md` the skill is listed in.

---

## 2. Create the skill file

```
skills/<name>/
└── SKILL.md
```

### `SKILL.md` frontmatter

```markdown
---
name: <name>
description: <One-line description>. INVOKE WHEN: <trigger conditions>. Invoked as /<name>.
---
```

- `name` must match the directory name exactly.
- `description` is what Claude reads to decide whether to invoke the skill — make the "INVOKE WHEN" clause specific and unambiguous.
- "Invoked as `/<name>`" is the slash-command the user types.

### Body structure

Follow the pattern used by existing skills:

```markdown
# <Skill title>

<One-paragraph summary of what this skill does and when to use it.>

## When to use

<Bullet list of specific trigger scenarios.>

## <Main content section(s)>

<Rules, checklists, file templates, etc.>

## Non-negotiables (if applicable)

<Hard rules the agent must never violate.>

## Checklist

<Numbered steps — the agent works through these in order.>
```

Keep it concise. The agent reads this at invocation time; every sentence should earn its place.

---

## 3. Validate

```bash
pnpm test
```

The smoke test checks that every `skills/*/SKILL.md` exists. It will fail if the frontmatter is missing or the file is empty.

---

## 4. Update `README.md`

Add a row to the **Owned skills** table in the appropriate section:

```markdown
| [`<name>`](./skills/<name>/SKILL.md) | <Short description — match the "description" frontmatter field> |
```

- Workflow & safety skills → "Workflow & safety" table
- Repo-specific skills → "Project-specific (theholocron)" table

---

## 5. Update `AGENTS.md`

Add a row to the **Available skills** table in the matching section:

```markdown
| `<name>` | <trigger phrase — a few words> |
```

---

## 6. Open a PR

```bash
git add skills/<name>/SKILL.md README.md AGENTS.md
git commit -s -m "feat: add <name> skill"
```

Semantic-release handles versioning. The `pnpm test` smoke test runs in CI.

---

## Non-negotiables

- **`name` in frontmatter must match the directory name** — the smoke test and install tooling rely on this.
- **`INVOKE WHEN:` clause is required in `description`** — without it, the agent won't know when to invoke the skill automatically.
- **Both `README.md` and `AGENTS.md` must be updated** — `README.md` is the public-facing table; `AGENTS.md` is what agents read in consuming repos.
- **`pnpm test` must pass** before opening a PR.

---

## Checklist

1. Create `skills/<name>/SKILL.md` with correct frontmatter and body.
2. Run `pnpm test` — smoke test must pass.
3. Add row to `README.md` owned skills table (correct section).
4. Add row to `AGENTS.md` Available skills table (correct section).
5. Open a PR with a `feat:` commit signed with `-s`.
