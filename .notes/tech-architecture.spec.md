---
status: proposed # draft → proposed (issue filed) → approved (milestone attached)
issue: 74
---

# Holocron v2 architecture

## Decision

Holocron v2 is a **monorepo** of capability-based packages. The core
(`@theholocron/cli`) defines a small set of capability interfaces and
loads plugins that declare which capabilities they implement. A
single `holocron.config.json` per project wires capabilities → plugins.

```
packages/
  cli/              — @theholocron/cli         (binary + runtime + capability interfaces)
  cli-utils/        — @theholocron/cli-utils   (prompts, openers, shell, log — carryover from v1)
  holocron-plugin-github/
  holocron-plugin-vercel/
  holocron-plugin-neon/
  holocron-plugin-clerk/
  holocron-plugin-1password/
  holocron-plugin-postman/
  …
```

The published name pattern is `@theholocron/holocron-plugin-<provider>`
(ESLint convention). Third-party plugins can publish under any scope
as long as the package name starts with `holocron-plugin-`.

## Why

- **Same problem at every project.** Pick hosting / db / auth /
  secrets / CI / issue tracker, wire all the secrets, configure all
  the workflows, repeat. Doing this by hand each time is a recipe for
  the kind of security drift that prompted this extraction in the
  first place.
- **A single vendor often provides multiple capabilities.** GitHub
  alone covers source control, CI, issues, platform secrets, packages
  registry, and code scanning. Modelling adapters as
  one-per-vendor would either duplicate code (one per capability) or
  lose flexibility (can't use GH Actions but Linear issues). The
  capability/provider split solves both.
- **The capability split also makes adapters small.** A `hosting`
  contract has maybe four methods; an entire `cli-vercel`
  one-stop-shop would have dozens. Smaller surface = easier to
  re-implement = easier to mock = easier to test.
- **Config is the source of truth.** No hardcoded vendor lists in
  code; no hardcoded app paths; no implicit assumptions. The config
  declares what the project is, and the runtime + plugins do the rest.

## Capability vocabulary (v1)

The eleven capabilities holocron v2 supports out of the box:

| Capability        | What it does                                | Typical providers       |
| ----------------- | ------------------------------------------- | ----------------------- |
| `sourceControl`   | Repo, branches, PRs                         | GitHub, GitLab, Bitbucket |
| `ci`              | Workflow files, runs                        | GitHub Actions, GitLab CI, CircleCI |
| `issues`          | Tracker                                     | GitHub Issues, Linear, Jira |
| `platformSecrets` | CI/host-level secrets (GH Actions secrets)  | GitHub, GitLab          |
| `hosting`         | Deploy targets                              | Vercel, Netlify, Fly, Cloudflare |
| `dataStore`       | Database                                    | Neon, Supabase, Railway, Render |
| `auth`            | Identity                                    | Clerk, Auth0, Supabase Auth, Keycloak |
| `envSecrets`      | App-level secret manager                    | 1Password, Bitwarden, Vault, Doppler |
| `apiTooling`      | API collection / spec mirror                | Postman, Insomnia, Stoplight |
| `notifications`   | Alerts and ops messaging                    | Slack, Discord          |
| `analytics`       | Observability and error tracking            | Sentry, Datadog, PostHog |

Each capability is a TypeScript interface in
`packages/cli/src/capabilities/index.ts`. Plugins implement one or
many; nothing forces them to implement all.

## Config shape

`holocron.config.json` (committed; one per project):

```jsonc
{
  "project": {
    "name": "rando-id",
    "description": "Location-based contacts app"
  },

  "providers": {
    "sourceControl": "github",
    "ci": "github",
    "issues": "github",
    "platformSecrets": "github",

    "hosting": ["vercel", { "team": "rando", "projectIds": { "web": "prj_…" } }],
    "dataStore": ["neon", { "kind": "postgres-postgis", "branchStrategy": "per-pr" }],
    "auth": ["clerk", { "syncTable": "users", "webhookSecretEnv": "CLERK_WEBHOOK_SECRET" }],
    "envSecrets": ["1password", { "vault": "rando", "account": "uuid…" }],
    "apiTooling": ["postman", { "workspaceId": "…", "collectionId": "…" }],

    "notifications": "slack",
    "analytics": "sentry"
  },

  "apps": [
    { "name": "web", "path": "apps/web", "kind": "next" },
    { "name": "api", "path": "apps/api", "kind": "next-api" },
    { "name": "native", "path": "apps/native", "kind": "expo" }
  ],

  "doctor": {
    "checks": ["brewfile", "secrets", "env"]
  }
}
```

Short form (`"github"`) resolves to `@theholocron/holocron-plugin-github`.
Tuple form (`["vercel", { … }]`) supplies plugin-specific options.
Fully-qualified package names (`["my-org/custom-plugin", {…}]`) are
honored verbatim so third-party plugins work out of the box.

Presets (`"extends": "@theholocron/preset-X"`) are **deliberately
out-of-scope for v2.0**. They'll arrive in v2.1 once a second project
proves the abstraction is worth distilling.

## Package layout

The monorepo uses **pnpm workspaces** with a shared catalog for
common dev-deps.

```
package.json                — monorepo root, scripts that fan to packages
pnpm-workspace.yaml         — workspace + catalog declarations
tsconfig.json               — root, references each package
.notes/                     — design docs (this file lives here)
packages/
  cli/
    package.json            — @theholocron/cli (binary)
    tsconfig.json
    src/
      cli.ts                — yargs entry, binary `holocron`
      capabilities/index.ts — capability interfaces (the contracts)
      config.ts             — config schema + plugin-name resolution
      index.ts              — library entry (exported types)
  cli-utils/
    package.json            — @theholocron/cli-utils
    src/                    — v1 helpers, moved with git history preserved
      ui/                   — prompts, openers
      tasks/                — find, replace
      utils/                — $, config, env, log, node
```

Plugins ship as separate packages under `packages/holocron-plugin-*`.

## License

**MIT.** The v1 repo was GPL-3.0 — viral copyleft means any consumer
that imports `@theholocron/cli` as a library could be forced to GPL
their project. Since the whole point of v2 is that other projects
should be able to install it (and `cli-utils` is genuinely a library
of helpers, not just a CLI binary), GPL is incompatible with the
audience we want. MIT matches the npm ecosystem norm for tooling and
removes the legal friction.

The license switch happens at the same time as the v2 restructure;
the v1.x line stays GPL-3.0 on `main` for historical accuracy.

## What's Rando-specific and stays in Rando

Decisions from the design conversation that need to be acted on
during the Rando → Holocron migration:

- **App names are config-driven.** No `apps/web`, `apps/api`, etc.
  hardcoded anywhere in the extracted code. Today's Rando CLI
  sprinkles these across `setup-vercel.ts`, deploy commands, doctor
  checks; all must read from `holocron.config.json` → `apps[]`.
- **Postgres / PostGIS specifics become the Neon plugin.** Migration
  flow, seed/reset commands, `load-env.ts`, PostGIS migration quirks
  — all behind `holocron-plugin-neon` exposing `dataStore` with a
  `kind: "postgres-postgis"` option. Other dataStore plugins
  (Supabase, Railway) provide their own implementations.
- **Clerk webhook sync flow moves to the Clerk plugin.** `rando clerk
  webhook setup` becomes part of `holocron-plugin-clerk`'s `auth`
  capability. The Rando-side `users` table sync logic stays in
  Rando — it's app-data, not infra.
- **Doctor framework stays in core; specific checks become plugin
  contributions.** The `check.run() → ok|warn|fail` framework + the
  CLI shell are generic. Each plugin can register checks it owns.
  Rando-specific checks (Brewfile, 1P account UUID validation) ship
  inside Rando's project, registered via a local
  `holocron.config.json` → `doctor.checks[]` entry.

## Migration from Rando

**Big-bang.** Build holocron v2 to feature parity with Rando's
current `packages/cli`, then point Rando at it in a single PR that
deletes `packages/cli` and adds `@theholocron/cli` as a dep + a
`holocron.config.json`.

Phases:

1. **Scaffold (this commit).** Monorepo structure, capability
   interfaces, MIT relicense, spec. No functionality yet.
2. **Carryover.** Walk Rando's `packages/cli/src/adapters/*` and port
   each into the matching plugin package. Source of truth is the
   adapter interface that already exists.
3. **Orchestrator commands.** `holocron setup` / `doctor` / `clean`
   land in core, calling into plugins via capabilities. Mirror
   Rando's `rando setup` / `doctor` semantics.
4. **Workflow generators.** The `.github/workflows/*.yml` templates
   shipped by Rando's `vc setup` move into
   `holocron-plugin-github`'s `ci` capability.
5. **Rando flips over.** One PR in `rando-id/rando.id` removes
   `packages/cli`, adds `@theholocron/cli` + a
   `holocron.config.json`, updates all docs.

The first real validation that the design works comes when a second
project (different vendors — likely Supabase instead of Neon, per the
"next idea" answer) successfully spins up via `holocron setup`. Until
that happens, the capability interfaces are educated guesses.

## Options considered

- **Single-package CLI (status quo from v1).** Rejected: doesn't
  scale to multiple providers cleanly; adding `cli-vercel` /
  `cli-neon` / etc. would balloon the surface area of one package.
- **One package per vendor (`@theholocron/cli-github`).** Considered.
  Rejected because vendors provide multiple capabilities and the
  capability/provider naming would still bleed into the package
  surface. The capability-first model is cleaner.
- **One package per capability (`@theholocron/cli-source-control`
  with built-in GitHub/GitLab impls).** Considered. Rejected because
  it forces a vendor switch to mean installing a different package
  every time, and bundles unrelated vendors into one dependency tree.
- **Slim core + everything external from day one.** Considered.
  Rejected for v2.0 because we'd be designing the plugin API in the
  dark; better to ship the built-in set together, learn what the
  plugin contract really needs, then formalize.

## Open questions

- **Plugin resolution order.** Today's adapter pattern in Rando uses
  factory injection (`Adapters` object). The plugin loader needs to
  resolve packages at runtime — node import? require.resolve? An
  explicit `plugins[]` array in config? Inclined toward an explicit
  array so dynamic resolution failures fail loud.
- **Cross-capability dependencies.** `apiTooling` needs to know
  `sourceControl`'s repo coords; `hosting` needs to know `dataStore`'s
  connection string. The core needs a "capability registry" that
  plugins can query. Design TBD.
- **State persistence.** Where do remembered choices live (e.g.
  "you already linked Vercel project prj_X to apps/web")? Options:
  (a) commit to `holocron.config.json`, (b) gitignored
  `.holocron/state.json`, (c) query providers every time. Leaning
  toward (a) for repo-shareable state, (c) for "is this still true"
  checks.
- **Doctor check registration.** Plugins should be able to ship
  checks, but the operator needs to opt in (not all checks make sense
  for all projects). Inclined to mirror ESLint's `rules` model:
  `doctor.checks: { "secrets/op-account-uuid": "warn" }`.
- **Versioning model.** Independent (each package versions on its
  own) vs lockstep (one major across the monorepo)? Inclined toward
  independent — semver discipline is on the plugin authors.
- **Binary distribution.** Today the v1 binary is `tsx ./src/cli.ts`
  in dev mode and `marked-man` for the manpage. v2 needs a real build
  step (probably `tsdown` or `unbuild`). Out of scope until first
  release.
