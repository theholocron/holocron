<!-- editorconfig-checker-disable-file -->

# Holocron

<!-- holocron:description -->

A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.

<!-- /holocron:description -->

## Quickstart

<!-- prettier-ignore -->
```bash
# 1. Install the CLI + the source plugin and a vault plugin
npm  i -g @theholocron/cli@alpha
pnpm add -D @theholocron/holocron-plugin-github@alpha

# Vault — pick one: 1password, doppler, or infisical
pnpm add -D @theholocron/holocron-plugin-doppler@alpha
# or: pnpm add -D @theholocron/holocron-plugin-1password@alpha
# or: pnpm add -D @theholocron/holocron-plugin-infisical@alpha

```

Create the config (e.g. `holocron.config.{ts | js | json}`

<!-- prettier-ignore -->
```typescript
// 2. Drop a holocron.config.ts at your repo root
import { defineConfig } from "@theholocron/cli";
import { node } from "@theholocron/holocron-config";

const { repo, workflows, providers } = node();
export default defineConfig({
	description: "Custom app that does custom things.",
	repo: {
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		...repo,
	},
	workflows,
	providers: {
		...providers,
		vault: ["doppler", { project: "holocron", config: "dev" }],
		secrets: "github",
		environments: "github",
	},
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
});
```

<!-- prettier-ignore -->
```bash
# 3. Store fine-grained PATs in the OS keyring (once per machine)
holocron auth set github.read    ghp_...  # clone + CI
holocron auth set github.admin   ghp_...  # setup + secrets + environments
# See docs/tokens.md for the full list of feature tokens and required scopes.

# 4. Verify the wiring
holocron doctor
```

Every additional capability (`ci`, `secrets`, `deployment`, `storage`,
`auth`, …) is one plugin install + one line of config away. The rest
of this README is the full picture.

## The idea

Many projects share the same setup work: pick a hosting provider, a
database, an auth provider, a secret vault, a CI host. Wire all the
secrets, the workflows, the deploys, the issue tracker. Holocron
makes that work **declarative, swappable, and re-runnable**.

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "name": "my-app",

  "providers": {
    // Code + CI
    "source": "github",
    "ci": "github",
    "secrets": "github",
    "environments": "github",
    "issues": "github",

    // Hosting + data
    "deployment": ["vercel", { "team": "my-team" }],
    "storage": ["neon", { "kind": "postgres" }],
    "auth": "clerk",
    "dns": "cloudflare",

    // Source of truth for secrets (required)
    "vault": ["1password", { "vault": "my-app" }],

    // Multi-provider
    "tooling": ["postman", "storybook"],
    "notifications": ["slack", "discord"],
    "analytics": ["google"],
    "observability": ["sentry"],
  },
}

```

Then:

<!-- prettier-ignore -->
```bash
holocron setup           # apply the whole config, top to bottom
holocron doctor          # check everything's wired right
holocron secrets sync    # vault → secrets + deployment env vars + .env
holocron deploy          # ship to your `deployment` provider

```

## How it works

- **Capabilities** are the contracts (14 of them — see the
  [architecture spec](./.notes/archive/tech-architecture.spec.md)).
- **Plugins** are npm packages named `holocron-plugin-<provider>`
  (or `@theholocron/holocron-plugin-<provider>` for the built-in
  set). Each plugin exports the capabilities it implements — a
  single provider can cover several (GitHub does source + CI +
  issues + secrets + environments).
- **Config** is ESLint-style: short form `"vercel"` for defaults,
  tuple form `["vercel", { team: "my-team" }]` for options,
  multi-list `["slack", "discord"]` for capabilities that allow
  several providers active at once.

## The vault is special

Every project has secrets somewhere. They don't go in the repo, they
don't go in the config — they go in the **vault**, which is the only
required capability. Everything else that needs secrets (CI, runtime
env vars, local `.env`) syncs FROM the vault:

<!-- prettier-ignore -->
```
vault (1Password)
  ├─→ secrets       (GitHub Actions)
  ├─→ deployment    (Vercel env vars)
  └─→ local .env    (for dev)

```

## Repo layout (v2)

<!-- prettier-ignore -->
```
packages/
  cli/                            — @theholocron/cli                       (binary + capability runtime)
  holocron-plugin-github/         — @theholocron/holocron-plugin-github    (source, ci, secrets, environments, issues)
  holocron-plugin-vercel/         — @theholocron/holocron-plugin-vercel    (deployment)
  holocron-plugin-neon/           — @theholocron/holocron-plugin-neon      (storage)
  holocron-plugin-clerk/          — @theholocron/holocron-plugin-clerk     (auth)
  holocron-plugin-1password/      — @theholocron/holocron-plugin-1password (vault — CLI shell-out)
  holocron-plugin-doppler/        — @theholocron/holocron-plugin-doppler   (vault — REST)
  holocron-plugin-infisical/      — @theholocron/holocron-plugin-infisical (vault — REST)
  holocron-plugin-postman/        — @theholocron/holocron-plugin-postman   (tooling)
holocron.config.ts                — this repo's own holocron config (self-hosted)
.notes/                           — design specs (draft → proposed → approved)
.claude/skills/holocron-plugin.md — scaffolding skill for new plugins

```

## Self-hosting

This repo carries its own `holocron.config.ts` so holocron commands
work inside it, and publishes its own packages via npm Trusted
Publishing (OIDC — no stored `NPM_TOKEN`). Setup + new-package
bootstrap live in [`docs/self-hosting.md`](./docs/self-hosting.md).

## License

MIT. See [`LICENSE`](./LICENSE).
