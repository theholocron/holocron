---
id: SPEC-0074
status: draft
issue: theholocron/holocron#2061
blocked-by: []
related:
  - theholocron/holocron#2058
discussion:
  url: https://discord.com/channels/1303969001822486568/1569904342566309899
---

# `secrets sync`: a deployment receives only the keys it is told to

## Problem

`holocron secrets sync <environment> --project-id <id>` sends every key of the vault Environment to the `deployment`
provider (Vercel), and `--worker <script>` does the same to a Worker's secrets. The GitHub destination has an
allowlist (`--github-secret`, `repo.secrets.sync` `keys`); these two do not. It is safe today only because the
`Sentinel` and `Comlink` Environments hold nothing but their own keys. #2058 puts production values next to other
tokens, so an unfiltered sync would push an admin or release token to a deployed app. A secret goes only where it is
needed, and `ci/workflows/sync-secrets.yml` already records one incident of an over-broad sync.

## Decision

### Where it is declared

Today the deployment destination is configured by flags only (`--project-id`, `--target`, `--worker`). The allowlist
is config, because a flag a caller forgets fails open. A new `repo.secrets.deploy` list, a sibling of
`repo.secrets.sync`, in the `holocron.config.ts` the sync runs with (`--cwd apps/sentinel`, `--cwd apps/comlink`):

```ts
repo: {
	secrets: {
		deploy: [
			{ environment: "Sentinel", prefix: "SENTINEL_", keys: ["HOLOCRON_AXIOM_ORG"] },
			{ environment: "Comlink", prefix: "COMLINK_" },
		],
	},
},
```

`environment` is the vault Environment id given to `secrets sync`. It is a separate list from `sync` on purpose: `sync`
describes what lands in GitHub and is read by `doctor secrets` and `doctor variable-owners` as names GitHub must hold;
a deployment's names are not that.

### The rule

- A key is sent when it is in `keys` (exact) or starts with `prefix` (case-sensitive). Several entries for one
  Environment are unioned.
- An entry with neither a non-empty `keys` nor a `prefix` is a `ConfigError` at load (`validateSecretsDeploy()`), not
  a silent skip, and never "all keys".
- A sync that would use a deployment (`--project-id` with a `deployment` provider) or a Worker (`--worker`) for an
  Environment with no entry throws a `ConfigError` before the vault is read, naming the entry to add. A sync with
  neither destination, or one that only fills variables, needs no entry.
- The filter applies to both destinations that take "every key" today: `deployment` and the Worker's `workers`
  secrets. `secrets` and variables keep their own routes.
- A key outside the filter is never read for these destinations and never reaches `Deployment.setEnvVar` or
  `Workers.setSecret`. A listed key the vault does not hold is the existing skipped row (`not in the vault
environment`); a blank value is skipped as before.

### What is reported

- Each filtered name is a `skip` row per destination, message `filtered: not in repo.secrets.deploy (...)`, by name
  only. The run also prints one line per step: `not sent (N, outside SENTINEL_*, ...): A, B`.
- A dry run prints the names that would be sent (`…` rows) and the same filtered line, and writes nothing.
- `holocron doctor secrets` gets one row per Environment in `repo.secrets.deploy` (`deploy-<environment>`): the names
  that would go out and the ones kept back, read from the vault in memory; values are dropped at once. A vault that
  cannot list it is a skipped row. It never fails, so a token in the "sends" list is visible but is not judged.

### Migration

- Sentinel declares `prefix: "SENTINEL_"` plus `keys` for the three `HOLOCRON_` names `apps/sentinel/src` reads
  (`HOLOCRON_AXIOM_ORG`, `HOLOCRON_DISCORD_BOT_TOKEN`, `HOLOCRON_USER_SYNC_TOKEN`), so the sync keeps updating them.
- Comlink declares `prefix: "COMLINK_"`.
- `ci/workflows/sync-secrets.yml` needs no change to its command (it passes `--project-id`; the entry is read from
  `apps/sentinel`'s config); only its comment about the missing allowlist is updated, and the generated copy is
  rewritten by `holocron repo sync workflows`.
- A sync run before the entry exists now stops with the `ConfigError`; nothing is written. Vercel and the Worker keep
  what they hold (a sync never deletes).

## Open questions

1. **Workers.** The issue names the `deployment` destination. This spec applies the same rule to `--worker`, since
   Comlink's sync uses only that and "no secret goes where it is not needed" covers it. Say if Workers should stay
   all-keys for now.
2. **Sentinel's `HOLOCRON_` names.** The maintainer decision in #2058 is a `SENTINEL_` prefix. Sentinel also reads
   three `HOLOCRON_` names (above), which the `Sentinel` Environment holds today. They are listed in `keys` here.
   Decide whether they are renamed to `SENTINEL_` instead (then `keys` goes away), or stay listed.
3. **Where the entry lives.** `repo.secrets.deploy` sits under `repo`, as the other sync lists do, though a deployment is
   not a repository setting. An app-level key (for example `deploy.secrets`) is the alternative.
4. **Doctor severity.** The doctor row only reports. Failing on a name that looks like a token (`*_ADMIN_*`, `*_RELEASE_*`)
   was left out as a guess; it can be added once the prod Environment layout (#2058) is settled.
5. **Case.** Prefix matching is case-sensitive. Vault names are upper snake case by convention; a lower-case name is
   filtered, not sent.
