---
id: SPEC-0083
status: accepted
issue: theholocron/holocron#2136
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2041
  - theholocron/holocron#2089
discussion:
  url: https://discord.com/channels/1303969001822486568/1570605144113160414
---

# `doctor secrets`: one command, `--env`, and a matrix of where every secret lives

## Problem

Four deep checks answer one question, "is the vault's `<environment>` where it should be?", from different sides:

| Command                | Asks                                                               | Reads                                 |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `doctor credentials`   | Does this machine hold the tokens the plugins need?                | 1Password `local`, then `dev` (names) |
| `doctor secrets`       | Does GitHub hold what `repo.secrets.sync` lists, with the readers? | GitHub secrets, repo and organization |
| `doctor tokens`        | Does each token pass the vendor's own check?                       | The vendors' APIs                     |
| `doctor shared-values` | Does a secret hold one value in two layers?                        | 1Password layers (values, in memory)  |

`credentials` is not `secrets` limited to plugins; it is the same question asked of the local side, which is hard to
see from the names. `secrets sync <environment>` takes the environment as a positional and no doctor takes one.

`doctor secrets` also only checks that what the config lists exists. A secret that is in GitHub and that no
`repo.secrets.sync` entry feeds is not reported: `6 of 6 exist` stays green with a seventh in the store. A real
`secrets sync dev` wrote 25 such secrets to this repo's secrets (#2104, #2105), and they were found by listing them by hand.

`doctor variable-owners` (#2041) reports a name held by two places. It was written against the old Environment names;
under the layer layout (`<org/repo> - local|dev|ci|prod`) the same name legitimately lives in `dev`, `ci` and GitHub, so
most of what it would report is expected, and what it cannot report is the case above, a place with a name nothing feeds.

## Decision

One command, `holocron doctor secrets`. `--env` chooses the side, in the same words as `secrets sync`.

### `--env`

`--env <list>`: a comma-separated or repeated list of `local`, `dev`, `ci`, `test`, `prod`.

- With no `--env`, every environment the config declares runs, in the order `local`, `dev`, `ci`, `prod`. To debug,
  start with `--env local` and widen: `--env local,dev`, and so on.
- A place that cannot be read (no provider, a missing or refused token, an Environment not found) is a skipped row that
  names the place and the reason, for example `ci: could not read the GitHub secrets, HOLOCRON_SECRETS_TOKEN is not set`. It is never a failure,
  and the other places are still compared.
- `test` has no layer (tests use fakes and read none), so `--env test` is a skipped row that says so. It is accepted
  so that nobody has to remember which names exist.
- What each environment compares: `local` and `dev` the tokens the plugins list (their `tokens` export, as
  `doctor credentials` does today); `ci` the `repo.secrets.sync` and `repo.variables.sync` entries against GitHub;
  `prod` the `repo.secrets.deploy` destinations (the `deploy-<environment>` rows `doctor secrets` already has).

### The matrix

The default output is a matrix: one row per name, one column per place that can store it. The columns come from the
config, not a fixed list, and are grouped by what stores them:

- **1Password:** the layer Environments (`local`, `dev`, `ci`, `prod`).
- **GitHub:** repository and organization secrets, and variables (the row says which kind a name is).
- **Deploy:** each Vercel project or Worker that `repo.secrets.deploy` feeds.
- **Another vault:** a group per vault provider the config uses (Doppler, Infisical).

The matrix has two blocks with a heading each, **Secrets** and then **Variables**, so a visible value is never mistaken
for a concealed one. `--only-secrets` and `--only-variables` show one block; the default shows both. Names only; no value,
hash or length ever reaches the output. A cell is one of:

```text
ok       present where it should be
n/a      not needed here
MISSING  needed here, not found
extra    found here, but nothing feeds it
?        could not read this place
```

The legend is always printed, one meaning per line, and the cells are words, not symbols or colour, so a pipe or a log reads the same. Colour may be added on top.

"Needed" comes from the config, not a guess: a `local` or `dev` layer from the plugins' `tokens`, `ci` from the sync entries
(`keys`, `scope`, `repos`), and `prod` and the deploy columns from `repo.secrets.deploy`. A name in `dev` that no plugin
lists is `extra`, the same as a stray GitHub secret. With many columns the chart can pass the terminal's width, so it
wraps or turns when it must; `--env ci` narrows it to that layer and its destinations.

### Extras

`extra` is in the default output, not behind a flag. It is **advisory**: an `info` row (shown as skipped), exit 0.
`--strict` makes it a failure, as `shared-values --strict` does. Some secrets are meant to be set by hand (a repo that runs
Lighthouse stores `HOLOCRON_LIGHTHOUSE_TOKEN` at repository scope), so a short list in the config, `doctor.manualSecrets`
(names only, beside `doctor.sharedVariables`), is not reported.

### `--verify` and `--shared`

Both are opt-in, because each changes what the command touches.

- `--verify` runs the vendor checks `doctor tokens` runs today (network, slower, rate limits). The default stays offline.
- `--shared` compares values across the layers named by `--env` (two or more) by a per-run salted hash in memory, as
  `doctor shared-values` does; the default never reads a value. The `doctor.sharedVariables` allow list and the
  `--allow NAME` flag stay.

### `variable-owners` becomes a lookup

`holocron doctor secrets --name <name>` prints the row for one name and why each place is in the state it is,
for example `in ci, synced to repository secrets by the third entry` or `in GitHub only, no entry feeds it`. It is
informational and exits 0. The old "same name in two places" failure goes: with layers it is the normal case.

### The sync takes `--env`

`holocron sync secrets --env <environment>` replaces the positional, so the two commands share one vocabulary. The sync
takes one value, not a list: it writes, and a multi-environment write is the kind of mistake the dev-sync incident was.
`local` and `dev` stay refused (`assertSyncableLayer()`).

### Removed, with no aliases

`doctor credentials`, `doctor tokens`, `doctor shared-values` and `doctor variable-owners` are removed, not aliased. Every
reference changes in the same pull request as the behaviour that replaces it: the docs pages, `cli/cli/README.md`,
`AGENTS.md`, the plugins' docs, the `COMMAND_CONTEXTS`/`COMMAND_REGISTRY` entries (`deep-checks.test.ts` fails without them), and the
scheduled `check-tokens` workflow (`ci/workflows/check-tokens.yml` and its generated copy), which runs `doctor tokens` today
and becomes `doctor secrets --verify`.

## Rollout

Focused pull requests, in this order; each leaves the CLI working.

1. `sync secrets --env`, and `doctor secrets --env` (list, skipped rows that name the reason). No matrix yet.
2. The matrix as the default output, with `extra` and `--strict`, `doctor.manualSecrets`, and the name lookup.
3. Fold in `doctor credentials` (the `local` and `dev` columns); remove it.
4. `--verify`; remove `doctor tokens`; update the `check-tokens` workflow.
5. `--shared`; remove `doctor shared-values`.
6. Remove `doctor variable-owners`.

## Resolved questions

1. **Variables** are rows of the same matrix, in their own block after the secrets, with `--only-secrets` and
   `--only-variables` to show one. `doctor variables` folds in at step 2 or 3 and is removed with no alias.
2. **The lookup** is `--name <name>`, not a positional, so a name is never mistaken for an environment.
3. **`MISSING`** is a failure, as a missing secret is today. Only `extra` is advisory.
4. **An unreadable prod destination** (a Vercel project the token cannot read) is a skipped row that names why, as elsewhere.

## Not in scope

Fixing anything (the doctor stays read-only), comparing values outside `--shared`, writing any secret store, and the template
repos (parked on #1925).
