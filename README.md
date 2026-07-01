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
([GA July 2025](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/))
— GitHub Actions OIDC, no stored `NPM_TOKEN`, no token rotation.

### The chicken-and-egg + the one-time bootstrap

npm requires a package to already exist before you can configure
Trusted Publishing for it. So the actual flow is:

1. **One-time manual publish** of `v2.0.0-alpha.0` for every package
2. **Configure Trusted Publisher** for each package (or org-wide if npm exposes that)
3. **Push v2 → main** — CI takes over for `v2.0.0-alpha.1` and beyond, via OIDC

After step 3, no operator action is ever needed for releases again.

### Step 1 — one-time manual publish

```bash
# From the holocron repo root, on a clean checkout.
# Interactive npm sign-in via the browser (no token stored locally beyond
# npm's own session cookie):
npm login --auth-type=web

# Build everything fresh:
pnpm install --frozen-lockfile
pnpm build

# Run the holocron one-shot bootstrap publish. Verifies npm auth, runs
# `pnpm publish -r` with the right filters, prints direct links to each
# package's Trusted Publisher config page.
#
# If your npm account requires 2FA for writes (recommended), grab a
# one-time password from your authenticator and pass it via --otp. The
# same code is reused across all 7 publishes — they happen in seconds.
pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp 123456
```

The bootstrap command does the publish + reminds you exactly which URLs
to visit for step 2. The session token from `npm login` is local-only;
never enters CI.

Add `--dry-run` to print what would happen without actually publishing.
If you forget `--otp` and your account needs it, the command detects
the `EOTP` error in the output and prints the corrected command.

### Step 2 — configure Trusted Publisher for each package

In the npm web UI, for each `@theholocron/*` package:

1. Sign in at <https://www.npmjs.com>
2. Navigate to the package → Settings → Trusted Publishers
3. Configure:
    - **Publisher**: GitHub Actions
    - **Organization**: `theholocron`
    - **Repository**: `holocron`
    - **Workflow filename**: `release.yml`
    - **Environment** (optional): leave blank

Repeat for each:
`@theholocron/cli`,
`@theholocron/holocron-plugin-github`,
`@theholocron/holocron-plugin-vercel`,
`@theholocron/holocron-plugin-neon`,
`@theholocron/holocron-plugin-clerk`,
`@theholocron/holocron-plugin-1password`,
`@theholocron/holocron-plugin-postman`.

(If npm's UI exposes org-level Trusted Publishers, you can configure
once at the `@theholocron` org and it applies to every package
published under the scope.)

### Step 3 — flip the switch

```bash
# From v2:
gh pr create --base main --head v2 --title "v2 release line" --body "Phase 1-5 complete; auto-publish kicks in."
# Merge the PR. release.yml fires on push to main.
```

The release workflow requests an OIDC token from GitHub (permitted by
`id-token: write` in the workflow), `pnpm publish` exchanges it with
npm, npm validates against the registered Trusted Publisher, and the
publish proceeds. Provenance attestations are attached automatically —
no `--provenance` flag needed. Each version on npm shows a verified
✓ linking back to the CI run that produced it.

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
