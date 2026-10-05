---
status: draft
issue: theholocron/holocron#938
blocked-by: []
related:
  - theholocron/holocron#369
---

# Org-scoping GitHub's per-capability token resolvers

Addendum to [`tech-org-scoped-token-resolution`](../docs/wiki/specifications/tech-org-scoped-token-resolution.spec.md)
(#369) and [`tech-auth-bootstrap`](../docs/wiki/specifications/tech-auth-bootstrap.spec.md).
Both are `archived` (shipped); this spec covers a gap neither one closed.

## Context

#369 gave every plugin built on `createResolveToken` (`@theholocron/http-client`)
an org-namespaced keyring slot: `holocron auth set <provider> --org <name> <token>`
stores `<service>.<org>` instead of the single unnamespaced `<service>` entry,
so two orgs on the same machine never collide. Vercel, Doppler, Cloudflare,
and every other single-token plugin got this automatically — #369's own
text says "Plugin packages (`holocron-plugin-*`) require no changes," which
was true for all of them.

It wasn't true for GitHub. `packages/holocron-plugin-github/src/auth.ts`
doesn't call `createResolveToken` at all — GitHub is the one plugin that
implements enough capabilities (source/ci/secrets/environments/issues) to
need _per-capability_ least-privilege tokens, so it has its own resolver:

```ts
export const resolveReadToken = createFeatureResolver({
  envName: "HOLOCRON_READ_TOKEN",
  keyringKey: "github.read",
});
// ...resolveIssuesToken, resolveSyncToken, resolveReleaseToken,
//    resolveAdminToken, resolveDeployToken, resolveOrgToken
```

`createFeatureResolver` (`packages/cli/src/auth/auth-resolver.ts:38`) is a
second, hand-rolled resolution chain, local to this repo and never pushed to
`@theholocron/http-client`:

```ts
const token = input.cliToken || env.get(config.envName) || keyring(config.keyringKey);
```

No `org` field, no org-scoped keyring attempt, no vendor-native fallback
step. #369 never touched it because #369's design only reasoned about
single-token-per-provider plugins — this resolver didn't exist in that
spec's frame of reference at all, not a deliberate exclusion.

## Why this matters now

A new app is coming online that reuses this infra (GitHub + Vercel, likely
more) alongside Sentinel, on the same operator machine. Each consumer needs
its own least-privilege GitHub tokens — e.g. an `github.issues`-scoped PAT
for the new app, isolated from Sentinel's. Today:

```bash
holocron auth set github.issues --org new-app <token>
```

silently stores nothing useful: `--org` is accepted at the CLI layer (it's a
global flag, injected into every plugin's options per #369) but
`createFeatureResolver` never reads `input.org` — the new app's token and
Sentinel's token would collide on the same unnamespaced `github.issues`
keyring entry.

## Secondary gap: no provider prefix

The seven env vars have no provider component — `HOLOCRON_READ_TOKEN`,
`HOLOCRON_ISSUES_TOKEN`, etc. — unlike every `createResolveToken`-based
plugin's `HOLOCRON_<PROVIDER>_TOKEN` convention (`HOLOCRON_VERCEL_TOKEN`,
`HOLOCRON_CLOUDFLARE_TOKEN`). Harmless while GitHub is the only consumer of
per-capability resolvers. Becomes a real collision risk the moment a second
plugin (e.g. Vercel splitting deploy-write vs. env-write scopes) adopts the
same pattern and also wants an env var literally named `HOLOCRON_READ_TOKEN`.
Worth fixing in the same pass since the resolver itself is already being
touched.

## Goals

- `holocron auth set github.<capability> --org <name> <token>` works exactly
  like every other provider — same resolution order, same keyring namespacing.
- No second resolver implementation to keep in sync with `createResolveToken`
  going forward. One factory, one place org-scoping logic lives.
- Provider-prefixed env vars for GitHub's capability tokens, matching every
  other plugin.
- Backward-compatible keyring behavior: an operator with only an unnamespaced
  `github.read` entry (no org active) keeps working with no changes, per the
  same step-5-fallback #369 already established.

## Non-goal

- No new resolver abstraction, no generic "credential broker," no pluggable
  source types (env / vault / 1Password as interchangeable backends). The
  existing four-step precedence (`--token → HOLOCRON_<X>_TOKEN → vendor env →
org-scoped keyring → keyring`) already gives application code a single
  `resolveToken()` call with no vendor- or source-awareness baked in — that
  property is what we're extending to GitHub's capability tokens, not
  replacing.

## Design

### Retire `createFeatureResolver`

`createResolveToken` already supports everything `createFeatureResolver`
does, plus org-scoping, once one constraint is relaxed: `vendorEnvName` is
currently required, and GitHub's per-capability tokens have no single
vendor-native equivalent to fall back to (there's no `GITHUB_ISSUES_TOKEN`
convention upstream — only the broad `GITHUB_TOKEN` / `GH_TOKEN`, which
`resolveOrgToken`'s broader bootstrap-style resolver already covers
separately).

`@theholocron/http-client` changes (`ResolveTokenConfig`):

```ts
export interface ResolveTokenConfig {
  envName: string;
  /** Optional — omit when the capability has no single vendor-native env var. */
  vendorEnvName?: string;
  keyringService: string;
  errorMessage: string;
  getKeyringToken?: (provider: string) => string | null;
}
```

```ts
const token =
  input.cliToken ||
  env[config.envName] ||
  (config.vendorEnvName ? env[config.vendorEnvName] : undefined) ||
  (org ? keyring(`${config.keyringService}.${org}`) : null) ||
  keyring(config.keyringService);
```

`keyringService` already accepts an arbitrary string — `"github.read"`
resolves today with no changes needed there. Org-scoping composes on top
exactly as #369 designed: `keyring("github.read.<org>")` before
`keyring("github.read")`.

### GitHub plugin changes (`theholocron/holocron`)

`packages/holocron-plugin-github/src/auth.ts` switches all seven exports
from `createFeatureResolver` to `createResolveToken`, with provider-prefixed
env names and no `vendorEnvName`:

```ts
export const resolveReadToken = createResolveToken({
  envName: "HOLOCRON_GITHUB_READ_TOKEN",
  keyringService: "github.read",
  errorMessage:
    "no GitHub read token found. Pass --token <PAT>, set HOLOCRON_GITHUB_READ_TOKEN, " +
    "or run: holocron auth set github.read <PAT>",
});
// ...issues, sync, release, admin, deploy, org — same shape
```

`org` flows in automatically — `createResolveToken`'s returned function
already reads `input.org` (injected by `PluginLoader` per #369) with no
per-call-site change needed.

### CLI wrapper changes (`packages/cli/src/auth/auth-resolver.ts`)

Delete `createFeatureResolver` and `FeatureResolverConfig` once
`packages/holocron-plugin-github/src/auth.ts` no longer imports them. No
replacement export needed — call sites use the existing `createResolveToken`
wrapper already exported from this file.

### `holocron auth` commands

No changes. `commands/auth.ts` already builds keyring keys as
`input.org ?`${provider}.${input.org}`: provider` (#369) — `provider` here
is already whatever string the operator passes to `holocron auth set`, so
`holocron auth set github.read --org new-app <token>` already produces the
right keyring key (`github.read.new-app`) once the resolver on the read side
actually checks for it.

## Breaking change

Renaming `HOLOCRON_READ_TOKEN` → `HOLOCRON_GITHUB_READ_TOKEN` (and the other
six) breaks any existing CI secret or local env export using the old names.
No back-compat alias — per repo convention, change the code and document the
rename rather than carry a shim indefinitely.

- Commit marked `fix(auth)!:` with a `BREAKING CHANGE:` footer listing all
  seven old → new env var names.
- `docs/tokens.md` and this repo's own CI secrets (GitHub Actions, any
  `HOLOCRON_*_TOKEN` currently set under the old names) updated in the same
  PR.
- `packages/cli/README.md`'s token reference table updated.

## Implementation order

1. `theholocron/clients` — make `vendorEnvName` optional on
   `ResolveTokenConfig`; release `@theholocron/http-client`.
2. `theholocron/holocron` — bump the `http-client` catalog pin; migrate
   GitHub's seven resolvers to `createResolveToken` with the new env names;
   delete `createFeatureResolver`.
3. Rename the GitHub Actions secrets backing this repo's own CI (and any
   other `theholocron/*` repo consuming the old `HOLOCRON_*_TOKEN` names for
   GitHub capability tokens) to the prefixed form.
4. Docs: `docs/tokens.md`, `packages/cli/README.md`, CHANGELOG entry via the
   `BREAKING CHANGE:` footer.

## Open questions

1. **Does `resolveOrgToken` need the rename too?** It's the broadest-scope
   GitHub capability (`github.org`) and already shares its name with the
   `org`-scoping concept itself — `HOLOCRON_ORG_TOKEN` vs. the unrelated
   `HOLOCRON_ORG` env var (the active-org selector from #369) read
   differently in context but are easy to transpose when typing quickly.
   Leaning: rename to `HOLOCRON_GITHUB_ORG_TOKEN` along with the other six,
   for consistency — the collision risk with `HOLOCRON_ORG` is exactly the
   kind of thing the prefix fixes.
2. **Backfill other multi-capability plugins now, or wait for a second
   consumer?** Only GitHub implements enough capabilities today to want
   per-capability tokens. Per the minimal-config bias elsewhere in this repo,
   not generalizing further until a second plugin actually needs it.
