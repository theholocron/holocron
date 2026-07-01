---
status: proposed # draft → proposed (issue filed) → approved (milestone attached)
issue: 74
---

<!-- editorconfig-checker-disable-file -->

# Holocron v2 architecture

## Decision

Holocron v2 is a **monorepo** of capability-based packages. The core
(`@theholocron/cli`) defines a small set of capability interfaces and
loads plugins that declare which capabilities they implement. A
single `holocron.config.json` per project wires capabilities → plugins.

```
packages/
  cli/                          — @theholocron/cli                    (binary + runtime + capability interfaces)
  cli-utils/                    — @theholocron/cli-utils              (prompts, openers, shell, log — v1 carryover)
  holocron-plugin-github/       — @theholocron/holocron-plugin-github (first real plugin)
  holocron-plugin-vercel/       — (not yet)
  holocron-plugin-neon/         — (not yet)
  holocron-plugin-clerk/        — (not yet)
  holocron-plugin-1password/    — (not yet)
  holocron-plugin-postman/      — (not yet)
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
  alone covers source control, CI, issues, environments, secrets at
  several scopes, packages registry, and code scanning. Modeling
  adapters as one-per-vendor would either duplicate code (one per
  capability) or lose flexibility. The capability/provider split
  solves both: a plugin package implements N capabilities, and the
  config wires capability → provider.
- **Some capabilities are inherently multi-provider.** You might post
  alerts to Slack AND Discord, or send analytics to Google AND
  PostHog. The model needs to support both `single` and `many`
  cardinalities natively.
- **Config is the source of truth.** No hardcoded vendor lists in
  code; no hardcoded app paths; no implicit assumptions. The config
  declares what the project is, and the runtime + plugins do the rest.

## Capability vocabulary — 14 capabilities

| Capability      | Cardinality | What it owns                                                  | Typical providers                              |
| --------------- | ----------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `source`        | one         | Repos, branches, PRs, rulesets, repo settings, workflow files | GitHub, GitLab, Bitbucket                      |
| `ci`            | one         | Workflow runs and history                                     | GitHub Actions, GitLab CI, CircleCI            |
| `secrets`       | one         | CI/platform secrets store (repo / env / org scoped)           | GitHub Actions, GitLab CI                      |
| `environments`  | one         | Named deployment environments (reviewers, wait timers)        | GitHub, AWS                                    |
| `issues`        | one         | Issue tracker                                                 | GitHub Issues, Linear, Jira                    |
| `deployment`    | one         | Deploy targets (preview + prod, runtime env vars)             | Vercel, Netlify, Fly, Cloudflare               |
| `storage`       | one         | DB / object / file store                                      | Neon, Supabase, Railway, Render, S3            |
| `auth`          | one         | Identity provider                                             | Clerk, Auth0, Supabase Auth, Keycloak          |
| **`vault`**     | one         | **Source of truth for secrets (REQUIRED)**                    | 1Password, Bitwarden, HashiCorp Vault, Doppler |
| `dns`           | one         | DNS record management                                         | Cloudflare, Route 53, Namecheap                |
| `tooling`       | **many**    | Dev tooling                                                   | Postman, Storybook, Chromatic                  |
| `notifications` | **many**    | Alerts and ops messaging                                      | Slack, Discord, PagerDuty                      |
| `analytics`     | **many**    | Product analytics                                             | Google Analytics, PostHog, Plausible           |
| `observability` | **many**    | Error / perf monitoring                                       | Sentry, Datadog, NewRelic, OpenTelemetry       |

Each capability is a TypeScript interface in
`packages/cli/src/capabilities/index.ts`. Cardinality lives next to
the interfaces in a typed `CARDINALITY` map, so runtime + commands can
branch statically on whether a capability returns one provider or many.

## The vault — source of truth for secrets

`vault` is the only **required** capability. Every project has secrets
somewhere; holocron's job is to keep them out of the repo and out of
the config. The vault is the canonical store, and all other secret
destinations are populated from it:

```
1Password (vault, source of truth)
   ├─→ GitHub Actions secrets   (synced by `secrets` capability)
   ├─→ Vercel env vars          (synced by `deployment` capability)
   └─→ Local .env               (synced by `holocron secrets sync`)
```

The `secrets` capability (e.g., GitHub Actions secrets) is conceptually
a **sync destination**, not a source. The `deployment` capability owns
runtime env vars for the same reason: those are populated from the
vault at deploy time, not authored independently.

This split is the architectural answer to "why isn't 1Password just
another `secrets` provider?" — it plays a different role in the data
flow.

## Config shape

`holocron.config.json` (committed; one per project), ESLint-style:

```jsonc
{
	"project": {
		"name": "rando-id",
		"description": "Location-based contacts app",
	},

	"providers": {
		// Single-cardinality, short form: "provider"
		"source": "github",
		"ci": "github",
		"secrets": "github",
		"environments": "github",
		"issues": "github",
		"auth": "clerk",
		"dns": "cloudflare",

		// Single-cardinality, tuple form: [provider, options]
		"deployment": ["vercel", { "team": "rando", "projectIds": { "web": "prj_…" } }],
		"storage": ["neon", { "kind": "postgres-postgis", "branchStrategy": "per-pr" }],
		"vault": ["1password", { "vault": "rando", "account": "uuid…" }],

		// Many-cardinality, short form: [provider1, provider2, …]
		"tooling": ["postman", "storybook", "chromatic"],
		"notifications": ["slack", "discord"],
		"analytics": ["google"],
		"observability": ["sentry"],
	},

	"apps": [
		{ "name": "web", "path": "apps/web", "kind": "next" },
		{ "name": "api", "path": "apps/api", "kind": "next-api" },
	],

	"doctor": {
		"checks": ["brewfile", "secrets", "env"],
	},
}
```

Discriminator rule (in `packages/cli/src/config.ts`): an array entry
is a single `[provider, options]` tuple when its length is 2 AND
element [1] is a non-array, non-null object. Anything else with an
array is a multi-provider list. Fully-qualified plugin names
(`@my-org/some-plugin` or `holocron-plugin-x`) are honored verbatim
so third-party plugins work out of the box.

Presets are deliberately **out of scope for v2.0** — we'll add them in
v2.1 once a second project proves the abstraction is worth distilling.
The intended design is ESLint-shareable-configs-style with two levels
of sharing (see Roadmap §Shareable configs).

## Standards

These are the cross-cutting conventions every command + plugin in v2
honors. Codified in the
[`/holocron-plugin` skill](../.claude/skills/holocron-plugin.md) so
scaffolds inherit them automatically.

### `--dry-run` (global flag)

Every mutating command accepts `--dry-run`. Instead of calling
capability mutators, the command prints what would happen
(structured diff: "would set GH Actions secret X", "would PATCH
ruleset id=…"). The decision lives at the **command layer** —
commands branch on `ctx.dryRun` before calling. Capabilities stay
clean (no per-method `dryRun` knob) and are unaware.

Wired via `RuntimeContext.dryRun` in
`packages/cli/src/loader.ts`. Read-only commands (`doctor`,
`config show`) ignore the flag.

### `--token` (global flag)

Every command accepts `--token <value>`. The CLI passes it to every
loaded plugin as `cliToken`, taking precedence over env vars in each
plugin's auth resolution (`--token` → `HOLOCRON_<X>` → vendor-native).

**v2.0 limitation:** for multi-plugin commands the same token goes to
every plugin. Fine when one is in play; ambiguous when many
(`holocron setup` exercises github + vercel + neon). Per-plugin
disambiguation is tracked at #79; until then, multi-plugin flows
should use per-vendor env vars (`HOLOCRON_GH_TOKEN`,
`HOLOCRON_VERCEL_TOKEN`, etc.).

Tokens never appear in `holocron.config.json`. The config can declare
which env var to read (e.g., `auth: { tokenEnv: "MY_PAT" }`), but the
value lives in env (or, ideally, in the `vault`).

**No vendor-CLI fallback.** Local `gh` / `vercel` / `op` auth is
usually scoped narrower than admin commands need, so silent fallback
produces mysterious 403s. Explicit token only.

### Normalized events (cross-provider sync)

For flows that bridge two vendors (the canonical example: Clerk
webhook → Neon `users` table), holocron defines **normalized event
shapes** in core (`AuthEvent`, `NormalizedAuthUser`, …). Auth plugins
export a `parseWebhook(input): AuthEvent` utility that translates
the vendor's webhook payload into the normalized shape.

```ts
// User app code — vendor-agnostic
import { parseWebhook } from "@theholocron/holocron-plugin-clerk";
import type { AuthEvent } from "@theholocron/cli";

app.post("/webhooks/clerk", async (req) => {
	const event: AuthEvent = await parseWebhook({
		body: req.body,
		headers: req.headers,
		signingSecret: process.env.CLERK_WEBHOOK_SECRET!,
	});
	await db.users.upsert(event.user); // works regardless of auth provider
});
```

Swap clerk for another auth plugin → change one import line; the
handler body stays the same.

`parseWebhook` is **NOT a capability method**. It's a utility export
alongside `createPlugin`. The contract: take a vendor's webhook
delivery, return a normalized event (or throw
`WebhookVerificationError` on bad signature / malformed payload).

Real signature verification (Svix HMAC) is tracked at #80 — v2.0
ships the contract + JSON parsing; production-grade HMAC verification
lands in a follow-up.

## Package layout

```
package.json                — monorepo root, scripts that fan to packages
pnpm-workspace.yaml         — workspace + catalog (eslint, vitest, tsconfig, etc.)
tsconfig.json               — root, references each package
eslint.config.js            — workspace-level flat config
.notes/                     — design docs (this file lives here)
packages/
  cli/                      — @theholocron/cli (binary + runtime + interfaces)
  cli-utils/                — @theholocron/cli-utils (v1 carryover)
  holocron-plugin-github/   — @theholocron/holocron-plugin-github
```

Tests use **vitest** (workspace catalog) with per-package
`vitest.config.ts`; lint uses **typescript-eslint** + `@eslint/js`
recommended + a small handful of overrides.

> **Note on `@theholocron/eslint-config`:** v4.1.0 has an upstream
> bug — it calls `includeIgnoreFile()` on a `.gitignore` that isn't
> shipped in the npm tarball, so consuming it programmatically fails.
> The v1 repo only ran lint via super-linter in Docker, so this never
> surfaced. v2 uses a minimal local config until the org config is
> fixed (tracked at [theholocron/configs#197](https://github.com/theholocron/configs/issues/197)).

## License

**MIT.** The v1 repo was GPL-3.0 — viral copyleft means any consumer
that imports `@theholocron/cli` as a library could be forced to GPL
their project. Since the whole point of v2 is that other projects
should be able to install it (and `cli-utils` is genuinely a library
of helpers, not just a CLI binary), GPL is incompatible with the
audience we want. MIT matches the npm ecosystem norm for tooling.

The license switch happens at the same time as the v2 restructure;
the v1.x line stays GPL-3.0 on `main` for historical accuracy.

## What's Rando-specific and stays in Rando

- **App names are config-driven.** No `apps/web`, `apps/api`, etc.
  hardcoded anywhere in the extracted code. All read from
  `holocron.config.json` → `apps[]`.
- **Postgres / PostGIS specifics become the Neon plugin.** Migration
  flow, seed/reset, `load-env.ts`, PostGIS quirks all live behind
  `@theholocron/holocron-plugin-neon` exposing `storage` with a
  `kind: "postgres-postgis"` option.
- **Clerk webhook sync flow moves to the Clerk plugin.** `rando clerk
webhook setup` becomes part of `@theholocron/holocron-plugin-clerk`'s
  `auth` capability. The Rando-side `users` table sync stays in
  Rando — that's app data, not infra.
- **Doctor framework stays in core; specific checks become plugin
  contributions.** Each plugin can register checks it owns.
  Rando-specific checks (Brewfile, 1P account UUID validation) stay
  in Rando's project, registered via `doctor.checks[]`.

## Migration from Rando

**Big-bang.** Build holocron v2 to feature parity with Rando's current
`packages/cli`, then point Rando at it in a single PR that deletes
`packages/cli` and adds `@theholocron/cli` as a dep + a
`holocron.config.json`.

Phases:

1. **Scaffold + capabilities (done).** Monorepo, capability
   interfaces, config parser, plugin scaffold, test/lint infra.
2. **`holocron-plugin-github` impl (done).** All five capabilities
   (`source`, `ci`, `secrets`, `environments`, `issues`) ported with
   libsodium sealed-box encryption, lifecycle slot mapping, doctor
   report.
3. **Plugin loader + first orchestrator command (done).**
   `PluginLoader` resolves config → dynamic-imports plugins → builds
   typed capability registry. `holocron doctor` calls each loaded
   capability's smoke check. `holocron config show` dumps the
   resolved config.
4. **Remaining plugins (done).** Ported `vercel.ts`, `neon.ts`,
   `clerk.ts`, `1password.ts`, `postman.ts` from Rando, one plugin
   per package under `packages/holocron-plugin-*`.
5. **Orchestrator commands (done).** `holocron setup`,
   `holocron secrets sync`, `holocron deploy`. Mirror Rando's
   semantics. Built on the loader from phase 3 + the standards
   (`--dry-run`, `--token`) from the standards-setup pass.
6. **Rando flips over.** One PR in `rando-id/rando.id`.

The first real validation that the design works comes when a second
project (different vendors — likely Supabase instead of Neon, per
the "next idea" answer) successfully spins up via `holocron setup`.

## Options considered

- **Single-package CLI (status quo from v1).** Rejected: doesn't
  scale to multiple providers cleanly.
- **One package per vendor (`@theholocron/cli-github`).** Rejected:
  vendors provide multiple capabilities, and the
  capability-first model is cleaner.
- **One package per capability (with built-in vendor impls).**
  Rejected: forces a vendor switch to mean installing a different
  package and bundles unrelated vendors.
- **Slim core + everything external from day one.** Rejected for
  v2.0 — we'd be designing the plugin API in the dark. Ship the
  built-in set together first, learn what the plugin contract really
  needs, then formalize.

## Roadmap

### Shareable configs (post-v2.0)

ESLint-shareable-configs-style sharing at two levels. **Not in v2.0;
captured so we don't accidentally box ourselves out with the v2.0
schema.**

**Level 1 — per-capability config packages.** A single capability
entry can resolve to a config package that bundles a provider + its
options:

```jsonc
// project's holocron.config.json
{
	"providers": {
		"vault": ["@rando-id/holocron-vault"],
	},
}
```

The `@rando-id/holocron-vault` package exports something like
`{ provider: "1password", options: { vault: "rando", … } }`, and
holocron resolves that into the same shape as if the project had
written `["1password", { "vault": "rando", … }]` inline. Lets a team
share a vault setup across their repos without re-typing the vault
name in each one.

**Level 2 — whole-config presets.** The config file itself can be
JS/TS instead of JSON, importing a shared base:

```ts
// holocron.config.ts
import { holocronConfig } from "@rando-id/holocron-config";

export default holocronConfig;
```

Mirrors ESLint flat config — let an org publish their full set of
provider choices as a base, then individual projects extend / override.

### What the v2.0 schema MUST keep open

- Provider entries must be free to resolve through a config package
  (level 1) — the discriminator in `config.ts` currently assumes the
  first array element is a vendor name string; this is compatible
  with a config-package name (`@rando-id/holocron-vault` is also a
  valid package name), so level 1 layers cleanly on top later without
  a breaking change.
- The config file format must be allowed to evolve from JSON to
  JS/TS — the loader should look up `holocron.config.{json,js,ts}`
  in that order from day one, even if v2.0 only documents the JSON
  form.

## Open questions

- **Plugin loader implementation.** Dynamic import via package name?
  Explicit `plugins[]` array in config? Inclined toward implicit
  resolution from the `providers` block (the package list is derived).
- **Cross-capability dependencies.** `tooling` needs to know the repo
  coords; `deployment` needs the storage connection string at deploy
  time. The core needs a capability registry that plugins can query.
- **State persistence.** Where do remembered choices live (e.g.,
  "Vercel project prj_X already linked to apps/web")?
- **Doctor check registration.** Mirror ESLint's `rules` model:
  `doctor.checks: { "github/secrets-up-to-date": "warn" }`.
- **Versioning model.** Independent per-plugin vs lockstep across the
  monorepo? Inclined toward independent.
- **Binary distribution.** v1 used `tsx` + `marked-man`. v2 needs a
  real build step (probably `tsdown` or `unbuild`).
