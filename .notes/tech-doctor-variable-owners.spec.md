---
id: SPEC-0073
status: draft
issue: theholocron/holocron#2041
blocked-by: []
related:
  - theholocron/holocron#1672
  - theholocron/holocron#2039
  - theholocron/holocron#2043
discussion:
  url: https://discord.com/channels/1303969001822486568/1569828364204904590
---

# `doctor variable-owners`: flag a variable that lives in two places

## Problem

A variable that lives in two places drifts: one copy is rotated and the other is not, or the two carry different names
for one value. The Sentinel App's id and key were `SENTINEL_APP_ID` and `SENTINEL_APP_PRIVATE_KEY` in the Actions
Environment and `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` in the `Sentinel` Environment, and a value was copied from
the `Sentinel` Environment into the org Actions secrets (#2039, #2043). #2039 writes the "one owner per variable" rule
down; nothing checks it. `doctor credentials` and `doctor secrets` each read one Environment or one scope at a time.

## Decision

A new deep check, `holocron doctor variable-owners`, names only and read-only. It gathers the variable names from every
source, and reports a name that is in more than one.

Sources, all read through the providers the CLI already loads:

- **1Password Environments**, through `Credentials.inspect` (names, never values). The Environments are the ones the
  config names: each `credentials` provider's environment, `githubApps[].environment`, `dev.environment`, and the
  environment of every `repo.secrets.sync` and `repo.variables.sync` entry.
- **GitHub Actions secrets** at repository, organization and environment scope, through `Secrets.listSecrets`.
- **GitHub Actions variables** at repository and organization scope, through `Source.listVariables` and
  `Source.listOrgVariables`. (Environment-scope variables have no capability method; they are not read.)

A name is compared without regard to case, as GitHub does.

### Findings

1. **Same name in two sources: `fail`**, one row per name, with the sources listed in the problem line, unless it is
   explained (below).
2. **A bare name next to its prefixed one (`X` and `HOLOCRON_X`, `SENTINEL_X`, `COMLINK_X`) anywhere in the sources:
   `info`** (shown as skipped), because the fallback is deliberate during a rename. A pair that outlives the rename is a
   leftover; the row says so.
3. **A source that cannot be read: `skip`**, naming why (no provider, the provider cannot list names, no token, the
   Environment is not found). Never a failure.
4. No findings and at least one source read: one `ok` row with the counts.

### Open question 1: which token reads GitHub names

No new token and no new setting. The check calls the same `secrets` and `source` providers `doctor secrets` and
`doctor variables` call, so each scope uses the token the GitHub plugin already picks for it: the organization's secrets
use `HOLOCRON_SECRETS_TOKEN` (falling back to `HOLOCRON_ADMIN_TOKEN`), the repository's and an environment's secrets
use `HOLOCRON_ADMIN_TOKEN` (falling back to the secrets token), repository variables use the admin token and
organization variables use `HOLOCRON_ORG_TOKEN`. A scope whose token is missing or refused is a skip row that says so
(`missingTokenReason`, or the error text, which carries no value); the other scopes are still compared. Choosing the
existing providers keeps one place that decides tokens and means a token change needs no change here.

The tokens come from the normal chain (flag, process environment, `.env`, `credentials` providers, keyring), so the GitHub
reads use a loader that reads the `credentials` providers, as `doctor secrets` does. The Environments' names are listed by
a second loader built with `readCredentials: false`, so no value is loaded for that part. A token is only used to
authenticate and is never printed, logged or put in a row.

### Open question 2: where intended sharing is declared

Two kinds of copy are expected, and only one needs a list.

- **The sync fan-out is derived.** `repo.secrets.sync` and `repo.variables.sync` already say that Environment E fills
  GitHub scope S with these keys. A GitHub copy that an Environment held and a sync entry feeds is the one allowed copy
  and is not reported. An entry with no `keys` (secrets) is treated as feeding every name the Environment holds. If the
  Environment cannot be read, the check cannot tell and the GitHub copy is not paired with it.
- **The instances of one App are derived.** The Environments in `githubApps` (`Sentinel`, `Sentinel - dev`) hold the
  same names by design. They count as one place, so they never clash with each other, only with a different Environment.
- **Deliberate sharing is listed.** A name two Environments both hold on purpose (`HOLOCRON_DISCORD_BOT_TOKEN` in
  `Holocron` and `Sentinel`; `SENTINEL_AXIOM_DATASET` in `Sentinel` and the variables Environment) cannot be derived.
  The list is `doctor.sharedVariables: string[]` in `holocron.config.ts`, beside `doctor.mail`. Names only; a listed
  name is not reported. It goes in `doctor`, not `.holocron/repo.ts`: `repo` describes the repository's GitHub settings
  and `RepoConfig` has no such key, and the `doctor` block already holds what the checks need. It is a short, reviewed
  list, so a new copy is a conscious edit.

### Open question 3: new entry or rows of an existing check

A new `DEEP_CHECKS` entry, `variable-owners`. The rows span three capabilities (`credentials`, `secrets`, `source`);
putting them in `doctor credentials` or `doctor secrets` would make one of those depend on the other's providers and
change what their exit code means (a duplicate would fail `doctor secrets` on a machine with no 1Password). A separate
command can be run, skipped and read on its own. It costs the `COMMAND_CONTEXTS` (`workspace`) and `COMMAND_REGISTRY`
entries, and `deep-checks.test.ts` keeps them honest. The capability it is filed under is `credentials`.

## Not in scope

Comparing values, fixing anything (the doctor stays read-only), environment-scope Actions variables, and Environments no
part of the config names (`Comlink`, which holds only `COMLINK_*` names, is not read until a config names it).

## Rollout

Ships with the code that reads it, in one pull request, because the decisions are small and easier to review next to
the implementation. `holocron.config.ts` lists the two deliberate copies the maintainer's table in
`environment-variables.mdx` names.
