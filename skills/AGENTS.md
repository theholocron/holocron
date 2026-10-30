<!-- editorconfig-checker-disable-file -->

# skills — agent operating contract

`CLAUDE.md` is a symlink to this file. This folder is `@theholocron/skills`, the shared agent skill registry (formerly
the archived `theholocron/skills` repo). It releases on its own version line (tags `skills-v*`). Repo-wide rules are in
the root `AGENTS.md`.

## What it is

Each skill is a folder under `src/` holding a `SKILL.md` in Claude Code format. `holocron setup` installs skills into
consuming repos from the `skills` field in `holocron.config.ts`. The package ships the markdown directly; there is no
build step. `skills-lock.json` records the source and content hash of the third-party skills that are installed rather
than owned.

## Adding a skill

Use the `holocron-skill-skill` skill. By hand:

1. Create `src/<name>/SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <name>
   description: One-line description. INVOKE WHEN: <trigger conditions>.
   ---

   # skill title
   ```

2. Add a row to the matching table in `README.md`.
3. Run the package's unit tests (`pnpm --filter @theholocron/skills run verification.unitTests`). The smoke test fails
   when a folder under `src/` has no `SKILL.md`.
4. Use a `feat:` commit; semantic-release handles the version.
