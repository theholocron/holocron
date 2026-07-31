---
title: "skills"
description: Manage agent skills from the @theholocron/skills registry.
---

Skills are reusable Claude/Codex/Gemini instructions installed from `@theholocron/skills` into `.agents/skills/` with agent-specific symlinks. They're gitignored — `holocron setup` re-installs them on every fresh checkout.

## Subcommands

### `skills install`

```bash
holocron skills install [--dry-run]
```

Copies skills from `@theholocron/skills` into `.agents/skills/<name>/` and creates relative symlinks at the agent path (e.g. `.claude/skills/<name>` → `../../.agents/skills/<name>`).

The set of skills to install comes from `skills[]` in `holocron.config.ts`. Skills not in the list are left in place.

```bash
holocron skills install
holocron skills install --dry-run
```

### `skills remove [names..]`

```bash
holocron skills remove [name1] [name2] ...
```

Removes installed skills via `npx skills remove`. Omit names to remove all installed skills.

```bash
# Remove a specific skill
holocron skills remove git-safety

# Remove multiple skills
holocron skills remove git-safety pr-workflow

# Remove all skills
holocron skills remove
```

### `skills update [name]`

```bash
holocron skills update [name]
```

Updates installed skills to their latest upstream versions via `npx skills update`. Omit `name` to update all installed skills.

```bash
# Update a specific skill
holocron skills update commit-standards

# Update all skills
holocron skills update
```

## Skills registry

Skills are installed from [`@theholocron/skills`](https://github.com/theholocron/skills). Standard skills include:

| Skill                   | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `git-safety`            | Git safety rules — guard against destructive operations                     |
| `pr-workflow`           | PR workflow rules — always open a PR, never push directly to default branch |
| `commit-standards`      | Conventional Commits format + DCO sign-off                                  |
| `security-review`       | Security review checklist (OWASP top 10, Node.js pitfalls)                  |
| `holocron-skill-client` | Scaffold a new HTTP client package in theholocron/clients                   |
| `holocron-skill-config` | Scaffold a new config package in theholocron/configs                        |
| `turborepo`             | Turborepo monorepo build system guidance                                    |

## Config example

```ts
// holocron.config.ts
export default defineConfig({
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review"],
});
```
