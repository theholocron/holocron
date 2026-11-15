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

## The decision: which capability

|                             | A. New capabilities (`coverage`, `cache`)                                                                                                      | B. `tooling` (many)                                                          | C. No capability, probes only                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Swap the service            | change the provider entry; commands and templates are the vocabulary                                                                           | same, through `tooling`                                                      | nothing to swap: workflows still name the service                          |
| Fits the service's behavior | yes: methods named for what it does (repo activated, flags exist, required statuses; token valid for a team, cache reachable)                  | partly: `sync()` and `doctor()` fit Codecov, `sync()` is a no-op for a cache | none: only token checks                                                    |
| Cost now                    | new key in `CapabilityKey`, `CARDINALITY`, the org's `holocron_capabilities` property (`holocron apply properties`), docs for two capabilities | none; reuses `tooling`                                                       | none, but a plugin must be named under some `providers.<key>` to be loaded |
| Reversible                  | hardest: a published capability is API                                                                                                         | easy                                                                         | easy                                                                       |
| Token declaration and probe | unchanged                                                                                                                                      | unchanged                                                                    | unchanged                                                                  |

## Recommendation

**B for the first scope, A later and only when a capability method has a caller.** The token work does not need a
capability, and a capability with no second implementation and no caller is speculative API (and an org-property step
each time). `tooling` is already "a developer tool kept in step with the repo" with a `doctor()` that reports what was
found, which is what Codecov's flags and statuses are. Turbo would implement `doctor()` (token valid for the team,
cache reachable) and make `sync()` a documented no-op until a cache has something to keep in step.

Promote to `coverage` and `cache` when one of these is true: a second coverage or cache service is wanted, a command
needs to call a method no other `tooling` provider has (for example `holocron doctor coverage`), or the no-op `sync()` on
a cache becomes a lie in the docs. Moving a provider between capabilities is a rename in `providers` and the plugin's
`createPlugin`, not a change to the token declaration or probe.

## Out of scope

- Automating what the workflows do by hand (creating the Codecov repo and token, enabling the Turbo remote cache): each
  needs its own design, and this epic checks and does not write to a provider.
- The Codecov OIDC upload (`ci/actions/codecov-upload`): it uses no stored token, so there is nothing to declare for it.

## Open questions

1. Does the Codecov token that exists (`HOLOCRON_CODECOV_TOKEN`, used by `measure:bundle`) have a permission model the
   API reports, or only valid / invalid? Likewise Turbo's. If neither reports one, the declaration holds layers only,
   as Fern's and Vercel's do, and the probes say so.
2. Does a plugin with `tooling` and no `export()` and a no-op `sync()` read as honest, or is a narrower `tooling`
   (`doctor()` only, `sync` optional) a small change worth making first?
3. Which layers hold each token (`ci` only for both, as far as the workflows go; confirm against the Environments).

## Decision log

- (open) Capability: B first, promote later, as above.
