# `@theholocron/skills`

<!-- holocron:description -->

Shared agent skill registry.

<!-- /holocron:description -->

Each skill is a directory under `skills/` containing a `SKILL.md` file that Claude Code (and compatible
agents) can load as a slash command.

## Owned skills

Skills authored and maintained in this repo. Published inside the npm package.

### Workflow & safety

| Skill | Description |
|-------|-------------|
| [`git-safety`](./skills/git-safety/SKILL.md) | Never force-push or run destructive git ops without permission |
| [`pr-workflow`](./skills/pr-workflow/SKILL.md) | Always open a PR; one-change-per-PR; delete branch on close |
| [`commit-standards`](./skills/commit-standards/SKILL.md) | Conventional Commits format + DCO signing |
| [`security-review`](./skills/security-review/SKILL.md) | OWASP-oriented checklist for code review |

### Project-specific (theholocron)

| Skill | Description |
|-------|-------------|
| [`holocron-skill-config`](./skills/holocron-skill-config/SKILL.md) | Scaffold a new `@theholocron/*-config` package in `theholocron/configs` |
| [`holocron-skill-client`](./skills/holocron-skill-client/SKILL.md) | Scaffold a new `@theholocron/*-client` package in `theholocron/clients` |
| [`holocron-skill-plugin`](./skills/holocron-skill-plugin/SKILL.md) | Scaffold or migrate a new `holocron-plugin-*` package |

## External skills

Tracked in [`skills-lock.json`](./skills-lock.json) with source provenance and content hash.
Not committed to this repo — fetched from upstream by `holocron skills update` (planned).

| Skill | Source | Description |
|-------|--------|-------------|
| `find-skills` | [vercel-labs/skills](https://github.com/vercel-labs/skills) | Discover and install agent skills from the skills.sh ecosystem |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | Distinctive, intentional UI design guidance |
| `vercel-cli` | [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin) | Vercel CLI: deploy, env vars, logs, domains, project linking |
| `turbopack` | [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin) | Turbopack bundler: HMR, CSS, tree shaking, webpack migration |
| `turborepo` | [vercel/turbo](https://github.com/vercel/turbo) | Turborepo task pipeline configuration and cache optimization |

## Installation via `holocron setup`

Skills are installed by `holocron setup` based on the `skills` field in
`holocron.config.ts`. They are written to `.agents/skills/<name>/` with a
symlink at the agent-specific path, and **gitignored** — treated as dependencies,
not source.

```typescript
// holocron.config.ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  agent: "claude",
  skills: ["git-safety", "pr-workflow", "commit-standards", "security-review"],
  // ...
});
```

Then run:

```sh
pnpm add -D @theholocron/skills
GITHUB_TOKEN=$(gh auth token) pnpm exec holocron setup
```

## Manual installation

Copy a skill directory into your project's `.agents/skills/` and symlink it:

```sh
cp -r node_modules/@theholocron/skills/skills/git-safety .agents/skills/
ln -s ../../.agents/skills/git-safety .claude/skills/git-safety
```

Add both to `.gitignore`:

```gitignore
# managed by holocron setup — skills
/.agents/skills/
/.claude/skills/git-safety
```

## Contributing

### Adding an owned skill

1. Create `skills/<name>/SKILL.md` with the frontmatter format:
   ```markdown
   ---
   name: <name>
   description: One-line description. INVOKE WHEN: <trigger conditions>.
   ---
   # skill title
   …
   ```
2. Run `pnpm test` — the smoke test checks that every skill dir has a `SKILL.md`.
3. Update this README with a row in the owned skills table.
4. Open a PR with a `feat:` commit — semantic-release handles versioning.

### Registering an external skill

Run `npx skills add <repo> --skill <name>` from this repo root. This records the
skill in `skills-lock.json` with its source and content hash but does **not** copy
it into `skills/` — external skill content is fetched at install time.
