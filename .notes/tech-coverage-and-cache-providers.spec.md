---
status: draft
issue: theholocron/holocron#2167
blocked-by: []
---

# Codecov and Turbo as plugins

Child of epic #2147 (check the permissions and rotation of every token); covers #2167 (Codecov) and #2168 (Turbo). Both
services are wired by generated workflows and config and have no plugin, so there is nowhere to declare their tokens, no
`token` probe and no `doctor tokens` row. We may swap either for another service later, so the shape must not be
Codecov- or Turbo-specific.

## Problem

- **Codecov.** `holocron setup` and `holocron sync` write `codecov.yml` (`generators/codecov`: flags and components, one
  per release group) and the `codecov/patch*` statuses; the `codecov-upload` composite action uploads coverage with the
  job's OIDC token (no stored secret); `measure:bundle` uploads bundle stats with `HOLOCRON_CODECOV_TOKEN`. Nothing reads
  that token's permissions or checks that the flags, components and required statuses exist on the service.
- **Turbo.** The `setup` composite action maps `HOLOCRON_TURBO_TOKEN` and `HOLOCRON_TURBO_TEAM` onto the names turbo
  reads, and warns when a token has no team (the remote cache then turns off without a word). Nothing checks that the
  token is valid for the team or that the cache is reachable.

## What does not depend on the decision

A token's declaration (`PluginToken.expect`, spec `tech-token-declaration`) and its `token` probe live in the plugin's
`tokens` and `probes` exports, not in a capability. So the first scope below ships whichever way this is decided:

- a client in `clients/` (`@theholocron/codecov-client`, `@theholocron/turbo-client`; REST, bearer auth);
- a plugin `@theholocron/holocron-plugin-codecov` / `-turbo` with a `tokens` export declared per layer, a `token` probe
  (`Probe.acceptsToken`, `--environment <layer>`) and rotation where the service reports a token's age or expiry;
- rows in `holocron doctor tokens`, which already reads every configured plugin's `tokens`;
- tests, `tokens.mdx` (permission table and "What each ... token needs"), a plugin page and the AGENTS.md Probes
  paragraph.

## Options considered

|                             | A. New capabilities (`coverage`, `cache`)                                                                                                      | B. `tooling` (many)                                                          | C. No capability, probes only                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Swap the service            | change the provider entry; commands and templates are the vocabulary                                                                           | same, through `tooling`                                                      | nothing to swap: workflows still name the service                          |
| Fits the service's behavior | yes: methods named for what it does (repo activated, flags exist, required statuses; token valid for a team, cache reachable)                  | partly: `sync()` and `doctor()` fit Codecov, `sync()` is a no-op for a cache | none: only token checks                                                    |
| Cost now                    | new key in `CapabilityKey`, `CARDINALITY`, the org's `holocron_capabilities` property (`holocron apply properties`), docs for two capabilities | none; reuses `tooling`                                                       | none, but a plugin must be named under some `providers.<key>` to be loaded |
| Reversible                  | hardest: a published capability is API                                                                                                         | easy                                                                         | easy                                                                       |
| Token declaration and probe | unchanged                                                                                                                                      | unchanged                                                                    | unchanged                                                                  |

## Decision

**A: two new capabilities, `coverage` and `cache`, each `single`.** `tooling` is too generic: anything could be put in it,
and it would become an array of unrelated tools. A name that says what the service does keeps a swap (Codecov for another
coverage service, Turbo's cache for another remote cache) to a provider entry and a plugin, with no change to the
commands, templates or token checks.

The first scope keeps both capabilities small, as `Logs` is (`checkToken`, `readDataset`): the methods a command calls
today, and optional ones added only when a command needs them.

```ts
interface Coverage extends ProviderIdentity {
  readonly key: "coverage";
  /** Is the configured token accepted for the repository? Names and statuses only; never the token. */
  checkToken(): Promise<CoverageTokenCheck>;
  /** Later, when `doctor coverage` is built: the repo is active, the flags and components `holocron sync` writes exist,
   *  the required statuses (`codecov/patch`, `codecov/patch/documentation`) are reported. */
  checkRepo?(): Promise<CoverageRepoReport>;
}

interface Cache extends ProviderIdentity {
  readonly key: "cache";
  /** Is the token valid for the configured team, and is the remote cache reachable with it? */
  checkToken(): Promise<CacheTokenCheck>;
}
```

Adding them means: a key in `CapabilityKey` and `CARDINALITY` (`single`), the types in `capabilities.type.ts`, the org's
`holocron_capabilities` property (`holocron apply properties`, a human step before a repo declares one), the capability
count in AGENTS.md and the docs, and `providers.coverage` / `providers.cache` in `holocron.config.ts` for this repo.

## First scope (the plugins)

- `@theholocron/codecov-client` and `@theholocron/turbo-client` in `clients/`, `@theholocron/holocron-plugin-codecov` and
  `-turbo` implementing the capability above, each with `tokens` (declared per layer through `PluginToken.expect`), a `token`
  probe (`Probe.acceptsToken`, `--environment <layer>`) and rotation where the service reports an age or expiry.
- `holocron doctor tokens` picks them up with no change: it reads every configured plugin's `tokens`.
- Tests, `tokens.mdx`, a plugin page for each and the AGENTS.md Probes paragraph.

## What each token can be checked for

- **Codecov** has one token that does one thing (upload), so there is no permission model to declare. The declaration
  holds the layer only (`ci`), the probe says it cannot report permissions and checks that Codecov accepts the token for the
  repository. The `ci/actions/codecov-upload` OIDC upload uses no stored token and is out of scope.
- **Turbo's** token is a Vercel token, so it has what a Vercel token has: an owner, and a scope (Full Account or a team).
  Vercel does not report the scope (the Vercel plugin's declaration already says so), so the probe checks what can be
  proved: the token is accepted, and the remote cache answers for the configured team (`HOLOCRON_TURBO_TEAM`). It does not
  claim to know the scope. The same token may also be `HOLOCRON_VERCEL_TOKEN`; the plugins stay separate, because a swap of
  cache service must not touch the deployment plugin.

## Layers

Codecov: `ci` only. Turbo: `ci`, and `dev` and `local` too if a machine uses the remote cache with the token; this is
declared by what the Environments hold, so it is confirmed when the `dev` Environment is readable (until then the doctor
skips those rows). A layer that holds the token but is not declared fails the check, which is how a stray copy shows up.

## Out of scope

- Automating what the workflows do by hand (creating the Codecov repo and token, enabling the Turbo remote cache): each
  needs its own design, and this epic checks and does not write to a provider.
- The Codecov OIDC upload (`ci/actions/codecov-upload`): it uses no stored token.

## Open questions

1. What exactly does Turbo's remote-cache API report for a valid token and team (an artifacts status endpoint, and its
   answer for a token with no access to the team)? The probe is written against what the API returns, so this is read
   from the live service before the client is.
2. Does the `dev` Environment hold a Turbo token today? It decides whether `dev` and `local` are declared layers.
3. Names: the client packages and the `cache` capability's method names (`checkToken` mirrors `Logs`).

## Decision log

- Capability: `coverage` and `cache`, both `single` (decided in the session of #2220; `tooling` rejected as too generic).
