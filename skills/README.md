# `@theholocron/skills`

<!-- holocron:description -->

Shared agent skill registry.

<!-- /holocron:description -->

Each skill is a directory under `skills/` containing a `SKILL.md` file that Claude Code (and compatible
agents) can load as a slash command.

## Available skills

| Skill | Description |
|-------|-------------|
| [`git-safety`](./skills/git-safety/SKILL.md) | Never force-push or run destructive git ops without permission |
| [`pr-workflow`](./skills/pr-workflow/SKILL.md) | Always open a PR; one-change-per-PR; delete branch on close |
| [`commit-standards`](./skills/commit-standards/SKILL.md) | Conventional Commits format + DCO signing |
| [`security-review`](./skills/security-review/SKILL.md) | OWASP-oriented checklist for code review |

## Installation

Skills are installed by `holocron setup` based on the `skills` field in
`holocron.config.ts`. They are written to your agent's skills directory (e.g.
`.claude/skills/`) and **gitignored** — treated as dependencies, not source.

```typescript
// holocron.config.ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  agent: "claude",
  skills: ["git-safety", "pr-workflow", "commit-standards"],
});
```

Then run:

```sh
GITHUB_TOKEN=$(gh auth token) pnpm exec holocron setup
```

## Manual installation

Copy a skill directory into your project's `.claude/skills/`:

```sh
cp -r node_modules/@theholocron/skills/skills/git-safety .claude/skills/
```

Add it to `.gitignore` since `holocron setup` manages it:

```gitignore
# managed by holocron setup
.claude/skills/git-safety/
```

## Contributing

Add a new skill by creating `skills/<name>/SKILL.md` with the frontmatter format:

```markdown
---
name: <name>
description: One-line description. INVOKE WHEN: <trigger conditions>.
---

# skill title

skill content…
```

Open a PR — semantic-release handles versioning.
