# Holocron

A pluggable, capability-based CLI for spinning up and operating
software projects — your own infrastructure-as-tool.

> **Status:** v2 alpha, in active design. The published v1.x at
> `@theholocron/cli` is preserved on the `main` branch as an archive
> while v2 work happens on the `v2` branch. See
> [`.notes/tech-architecture.spec.md`](./.notes/tech-architecture.spec.md)
> for the design (tracked in [#74](https://github.com/theholocron/holocron/issues/74)).

## The idea

Many projects share the same setup work: pick a hosting provider, a
database, an auth provider, a secret vault, a CI host. Wire all the
secrets, the workflows, the deploys, the issue tracker. Holocron
makes that work **declarative, swappable, and re-runnable**.

```jsonc
// holocron.config.json
{
  "project": { "name": "my-app" },

  "providers": {
    // Code + CI
    "source":        "github",
    "ci":            "github",
    "secrets":       "github",
    "environments":  "github",
    "issues":        "github",

    // Hosting + data
    "deployment":    ["vercel", { "team": "my-team" }],
    "storage":       ["neon",   { "kind": "postgres" }],
    "auth":          "clerk",
    "dns":           "cloudflare",

    // Source of truth for secrets (required)
    "vault":         ["1password", { "vault": "my-app" }],

    // Multi-provider
    "tooling":       ["postman", "storybook"],
    "notifications": ["slack",   "discord"],
    "analytics":     ["google"],
    "observability": ["sentry"]
  }
}
```

Then:

```bash
holocron setup           # apply the whole config, top to bottom
holocron doctor          # check everything's wired right
holocron secrets sync    # vault → secrets + deployment env vars + .env
holocron deploy          # ship to your `deployment` provider
```

## How it works

- **Capabilities** are the contracts (14 of them — see the
  [architecture spec](./.notes/tech-architecture.spec.md)).
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

```
vault (1Password)
  ├─→ secrets       (GitHub Actions)
  ├─→ deployment    (Vercel env vars)
  └─→ local .env    (for dev)
```

## Repo layout (v2)

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

## Self-hosting — npm publishing via Trusted Publishing

This repo carries its own `holocron.config.json` so holocron commands
work inside it. npm publishing is wired via **Trusted Publishing**
(GitHub Actions OIDC), not a stored `NPM_TOKEN` — npm's recommended
path for CI publishers and the one that's resistant to leaked tokens.

### One-time setup on npmjs.com

For each of the 7 publishable packages, in the npm web UI:

1. Sign in at https://www.npmjs.com
2. Settings → Trusted Publishers → Add a Trusted Publisher
   (or per-package: package → Settings → Trusted Publishers)
3. Configure:
   - **Publisher**: GitHub Actions
   - **Organization**: `theholocron`
   - **Repository**: `holocron`
   - **Workflow filename**: `release.yml`
   - **Environment** (optional): leave blank, or set if you want a deploy-gate environment

Repeat for each:
`@theholocron/cli`,
`@theholocron/holocron-plugin-github`,
`@theholocron/holocron-plugin-vercel`,
`@theholocron/holocron-plugin-neon`,
`@theholocron/holocron-plugin-clerk`,
`@theholocron/holocron-plugin-1password`,
`@theholocron/holocron-plugin-postman`.

(If npm's UI exposes org-level Trusted Publishers, you can configure
once at the `@theholocron` org level instead and it applies to every
package published under the scope.)

### What happens at publish time

`release.yml` requests an OIDC token from GitHub (already permitted
via the workflow's `id-token: write` perm). `pnpm publish --provenance`
exchanges it with npm, which validates against the configured Trusted
Publisher and accepts the publish. No secret stored anywhere; no
token to rotate.

Published artifacts get a **provenance attestation** — npm shows a
verified ✓ next to each version, with a link back to the exact CI run
that produced it. Supply-chain audit trail for free.

## Ad-hoc secret setting (still useful)

For one-off secrets that ARE token-based (not npm publishing), the
`secret set` command still helps:

```bash
# Example: set a Vercel deploy hook secret on the holocron repo (hypothetical)
DEPLOY_HOOK=https://api.vercel.com/.../v1 HOLOCRON_GH_TOKEN=ghp_xxx \
  pnpm exec tsx packages/cli/src/cli.ts secret set DEPLOY_HOOK
```

Replaces clicking through GH Settings → Secrets → Actions → New for
any CI secret that isn't covered by OIDC. Same pattern across your
projects, not just this one.

## License

MIT. See [`LICENSE`](./LICENSE).
