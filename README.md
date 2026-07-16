<!-- editorconfig-checker-disable-file -->

# Holocron

A pluggable, capability-based CLI for spinning up and operating
software projects — your own infrastructure-as-tool.

> **Status:** `v2.0.0-alpha.0` — [release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
> Published under the `alpha` dist-tag on npm. APIs, config shape,
> and CLI surface may shift before stable v2.0.0. The v1.0.0 line at
> `@theholocron/cli` (a project-bootstrap CLI) is preserved as an
> archive under the `v1.0.0` git tag. Design in
> [`.notes/tech-architecture.spec.md`](./.notes/archive/tech-architecture.spec.md)
> (tracked in [#74](https://github.com/theholocron/holocron/issues/74)).

## Quickstart

<!-- prettier-ignore -->
```bash
# 1. Install the CLI + the two plugins you'll always need
npm  i -g @theholocron/cli@alpha
pnpm add -D @theholocron/holocron-plugin-github@alpha \
      @theholocron/holocron-plugin-1password@alpha

```

<!-- prettier-ignore -->
```jsonc
// 2. Drop a minimal holocron.config.json at your repo root
{
  "project": { "name": "my-app" },
  "providers": {
    "source": "github",
    "vault": ["1password", { "vault": "my-app" }],
  },
}

```

<!-- prettier-ignore -->
```bash
# 3. Verify the wiring
export HOLOCRON_GH_TOKEN=ghp_...          # or use --token / a fine-grained PAT
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
  "project": { "name": "my-app" },

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
  cli-utils/                      — @theholocron/cli-utils                 (prompts, openers, shell helpers — private; v1 carryover)
  holocron-plugin-github/         — @theholocron/holocron-plugin-github    (source, ci, secrets, environments, issues)
  holocron-plugin-vercel/         — @theholocron/holocron-plugin-vercel    (deployment)
  holocron-plugin-neon/           — @theholocron/holocron-plugin-neon      (storage)
  holocron-plugin-clerk/          — @theholocron/holocron-plugin-clerk     (auth)
  holocron-plugin-1password/      — @theholocron/holocron-plugin-1password (vault)
  holocron-plugin-postman/        — @theholocron/holocron-plugin-postman   (tooling)
holocron.config.json              — this repo's own holocron config (self-hosted)
.notes/                           — design specs (draft → proposed → approved)
.claude/skills/holocron-plugin.md — scaffolding skill for new plugins

```

## Self-hosting

This repo carries its own `holocron.config.json` so holocron commands
work inside it, and publishes its own packages via npm Trusted
Publishing (OIDC — no stored `NPM_TOKEN`). Setup + new-package
bootstrap live in [`docs/self-hosting.md`](./docs/self-hosting.md).

## License

MIT. See [`LICENSE`](./LICENSE).
