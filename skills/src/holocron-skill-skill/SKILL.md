---
name: holocron-skill-skill
title: "Holocron: New Skill"
description: Add a new owned skill to the skills folder of theholocron/holocron. INVOKE WHEN: user asks to create or add a new skill to the skills registry. Invoked as /holocron-skill-skill.
---

<!-- editorconfig-checker-disable-file -->

# Add a new skill

Add a new owned skill to `skills/` (the `@theholocron/skills` package) in `theholocron/holocron`.
The standalone `theholocron/skills` repo is archived; do not add skills there.

Replace `<name>` with the skill's kebab-case identifier (e.g. `git-safety`, `holocron-skill-config`).

There is no registry file or index to edit: the package ships everything under
`skills/src/`, `holocron repo setup` / `holocron skills` copy `skills/src/<name>/`
by name into a consuming repo, and the smoke test discovers skills by listing
the directories. Creating the directory is the registration; the README row and
docs page keep the human-facing listings in sync.

---

## 1. Decide the skill category

**Workflow & safety** — generic skills applicable to any repo (e.g. `git-safety`, `commit-standards`).
**Project-specific** — skills scoped to a particular theholocron repo or task (e.g. `holocron-skill-config`).

The category determines which table of `skills/README.md` the skill is listed in.

---

## 2. Create the skill file

```
skills/src/<name>/
└── SKILL.md
```

Optional supporting files (templates, examples) go in `skills/src/<name>/assets/`
(see `skills/src/adr/assets/`); they ship with the skill.

### `SKILL.md` frontmatter

```markdown
---
name: <name>
title: "<Short title>"
description: <One-line description>. INVOKE WHEN: <trigger conditions>. Invoked as /<name>.
---
```

- `name` must match the directory name exactly.
- `description` is what Claude reads to decide whether to invoke the skill — make the "INVOKE WHEN" clause specific and unambiguous.
- "Invoked as `/<name>`" is the slash-command the user types.
- `title` is optional; most skills carry one (see `git-safety`).

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
Any path or command a skill names must exist in the repo — run it or `ls` it before writing it down.

---

## 3. Validate

```bash
pnpm --filter @theholocron/skills verification.unitTests
```

The smoke test (`skills/test/index.mjs`, a `node:test` suite) checks that every
directory under `skills/src/` contains a `SKILL.md`. Also run
`pnpm exec prettier --check skills/` — the markdown is formatted.

---

## 4. Update `skills/README.md`

Add a row to the **Owned skills** table in the matching section:

```markdown
| [`<name>`](./src/<name>/SKILL.md) | <Short description — match the "description" frontmatter field> |
```

- Workflow & safety skills → "Workflow & safety" table
- Repo-specific skills → "Project-specific (theholocron)" table

---

## 5. Update the docs site

- Add `docs/src/content/docs/skills/<name>.mdx` (frontmatter `title`, `description`;
  copy a small sibling such as `git-safety.mdx`).
- Add a row to the Skills table in `docs/src/content/docs/skills/index.mdx`.
- Add `{ label: "<name>", slug: "skills/<name>" }` to the Skills group of the
  sidebar in the root `astro.config.ts` (alphabetical).
- If it is a standard skill worth advertising, add a row to the registry table in
  `docs/src/content/docs/commands/skills.mdx`.

---

## 6. Open a PR

```bash
git add skills/src/<name>/SKILL.md skills/README.md docs/src/content/docs/skills astro.config.ts
git commit -s -m "feat(skills): ✨ add <name> skill"
```

`@theholocron/skills` is its own version group (tags `skills-vX.Y.Z`, changelog in
`skills/CHANGELOG.md`); semantic-release computes the bump from the commit type.
There is no `AGENTS.md` skills table in this repo to update.

---

## Non-negotiables

- **`name` in frontmatter must match the directory name** — the install tooling relies on it.
- **`INVOKE WHEN:` clause is required in `description`** — without it, the agent won't know when to invoke the skill automatically.
- **The `skills/README.md` row, docs page, docs index row and sidebar entry ship in the same PR.**
- **The skills unit test must pass** before opening a PR.

---

## Checklist

1. Create `skills/src/<name>/SKILL.md` with correct frontmatter and body.
2. Run `pnpm --filter @theholocron/skills verification.unitTests` — smoke test must pass.
3. Add the row to the `skills/README.md` owned-skills table (correct section).
4. Add the docs page, `skills/index.mdx` row and sidebar entry.
5. `pnpm exec prettier --check` on the changed files; `holocron run ci` passes.
6. Open a PR with a `feat(skills):` commit signed with `-s`.
