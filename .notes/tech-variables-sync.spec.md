---
id: SPEC-0070
status: proposed
issue: theholocron/holocron#1817
blocked-by: []
related:
  - theholocron/holocron#1702
  - theholocron/holocron#1606
discussion:
  url: https://discord.com/channels/1303969001822486568/1568380310884716595
---

# Sync GitHub Actions variables from a 1Password Environment

## Problem

GitHub Actions secrets have one place to edit them: the 1Password Environment `Holocron - GitHub Actions`, pushed by
`holocron secrets sync` (#1702). Actions variables (`CLOUDFLARE_ACCOUNT_ID`, `TURBO_TEAM`, `AXIOM_DATASET`) are literal
values in `.holocron/repo.ts`, written by `holocron repo setup`. Configuration is therefore edited in two places.

1Password does not tell a visible value from a secret one, so the variables cannot share the secrets' Environment: a
secret put there by mistake would be written to a place anyone in the organization can read.

## Decision

The variables get their own Environment, `Holocron - GitHub Actions variables`, and the existing sync fills them. No
parallel command: `holocron secrets sync "<environment>"` writes the secrets an Environment is declared to fill and the
variables it is declared to fill, each through its own capability.

## Config shape

A sibling list on `repo.variables`, not a `kind` on `repo.secrets.sync`. The two entries have the same fields but
different destinations (`secrets` against `source`), and `doctor secrets`, `secretRoutes()` and the `--github-secret`
path all read `repo.secrets.sync` as secrets. A separate list cannot be misread by any of them.

```ts
variables: {
	sync: [
		{
			environment: "Holocron - GitHub Actions variables",
			scope: "org=theholocron", // "repo" (the default) or "org=<name>"
			keys: ["AXIOM_DATASET", "CLOUDFLARE_ACCOUNT_ID", "TURBO_TEAM"],
			visibility: "all", // organization only; "all" (the default) or "private"
		},
	],
},
```

`RepoVariablesSync` has `environment`, `scope`, `keys` and `visibility`. Names only: values are never in config.
`keys` is required (unlike secrets, where an omitted list means every key): a variable Environment that gained a key by
mistake must not publish it. `env=<name>` is not a scope, because the `source` capability has no environment variables.
Entries merge by environment and scope across presets, as `secrets.sync` does (`mergeSync()`, now generic).

## Writing

`secrets sync` calls `Source.syncVariables` (repo scope) or `Source.syncOrgVariables` (organization scope) once per key,
with `prune: false`, so a failure is one row and nothing is deleted. A key the Environment lacks, or holds blank, is a
skipped row: a placeholder never overwrites a working value. `--dry-run` writes nothing. An Environment declared only by
variable entries pushes nothing to `secrets` or `deployment`: without that, the secrets path would default to every
vault key at repository scope.

## Precedence

One source per name. A name in a sync entry and in a literal `repo.variables.repo` or `repo.variables.org` of the same
scope (compared case-insensitively, as GitHub does) is a `ConfigError` when the config loads. `prune: true` together
with `sync` is also a `ConfigError`: `repo setup` would delete the names the sync wrote, since it cannot know them. Literal
values stay supported for a repository without 1Password.

## Scrubbing

Values reach the command through the same `pushRow()` as secrets and are never printed or logged: rows carry names,
status and a reason only. Nothing here adds a scrubbing step because `secrets sync` has none to extend (it prints no
value; `runProbe` scrubs probe output, not this command). The one difference: a variable value is, by nature, readable
in GitHub afterwards, which is why the Environment is separate.

## Doctor

`doctor variables` adds one row per sync entry, `<environment> variables exist`, which lists the variables at that scope
and reports each declared name that is missing (and, for an organization entry that sets `visibility`, one that differs).
It cannot compare values, because it does not read the vault, so it prints names only. `doctor secrets` is unchanged.

## Migration

`.holocron/repo.ts` replaces the three literal organization variables with one sync entry for the Environment above. Until
the Environment is filled, the three keys are skipped and GitHub keeps its current values. To finish, create the
Environment with `AXIOM_DATASET`, `CLOUDFLARE_ACCOUNT_ID` and `TURBO_TEAM`, then run
`holocron secrets sync "Holocron - GitHub Actions variables"`.

## Follow-ups

- The `CLOUDFLARE_ACCOUNT_ID` preset constant and the `accountId` plugin options (Sentinel, Comlink, the wiki preset) are
  plugin options, not variables, and are not part of this change. Done in #1827: the plugin reads the id through the
  credential chain, and the Environment is a `credentials` entry.
- The remaining names noted in `.holocron/repo.ts` (`CLOUDFLARE_PAGES_PROJECT`, `POSTHOG_PROJECT_TOKEN`) can be added
  to the Environment once their values are settled.
- The Axiom dataset has one synced name, `AXIOM_DATASET`. The CLI reads `HOLOCRON_AXIOM_DATASET` first as a local
  override (`.envrc`), then `AXIOM_DATASET` from the process environment, then `log.axiom.dataset`, then the credential
  chain (`resolveValue`). The `sync` and `sync-github` workflows pass `AXIOM_DATASET: ${{ vars.AXIOM_DATASET }}` with no
  `HOLOCRON_AXIOM_DATASET` fallback. The config sits ahead of the chain so a local run with no `.envrc` stays on
  `holocron-local` instead of the CI dataset.
