---
id: SPEC-0075
status: draft
issue: theholocron/holocron#2063
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2061
  - theholocron/holocron#1606
discussion:
  url: https://discord.com/channels/1303969001822486568/1569901616478560391
---

# Derive the 1Password Environment name from the repo and the layer

## Problem

`holocron.config.ts` names 1Password Environments literally (`Holocron`, `Holocron - GitHub Actions variables`, the
vault's `Holocron - GitHub Actions`). The layout decided in #2058 is four Environments per repo, named
`<org/repo> - <layer>`: `theholocron/holocron - local`, `- dev`, `- ci`, `- prod`. The config should stop naming them,
and the old names must keep working until the maintainer renames the Environments.

## Where the names are read today

- `credentialsEnvironment(tuple, config)` (`config/config`): the entry's own `environment` option, else the shared
  `credentials.environment`. `resolveConfig` rejects a `credentials` provider with neither.
- `PluginLoader.load()` runs kyber `createPluginSystem`'s `preload` step: for each `credentials` provider it calls
  `credentialsEnvironment`, then `Credentials.read(environment)` and stores the variables under `<provider>:<name>`.
  The plugin never stores the name (`plugins/holocron-plugin-1password/src/capabilities/credentials.ts`).
- `doctor credentials`, `doctor variable-owners` (`owner-environments.ts`) and `auth set` call the same function.
- The 1Password `vault` capability takes `environment` as a plugin option (`vault.ts`, `readSecret` and `list`), and
  `secrets sync <environment>` takes the Environment from its argument or from each `repo.secrets.sync` /
  `repo.variables.sync` entry's `environment`.

## Decision

Derivation lives in the CLI, in `cli/cli/src/credentials-environments/`, so the plugin keeps receiving one name per
`read` call and stays free of git and layer logic.

1. **Applies to** a `credentials` entry of a provider that derives (`derivesEnvironment()`, today only `1password`)
   with no `environment` option and no shared `credentials.environment`. An explicit name always wins and is the only
   Environment read; the git remote is then not consulted.
2. **Slug.** `<org>/<repo>` from the `origin` remote of `RuntimeContext.repoRoot`, through `readGitRemote()` from
   `@theholocron/git-utils`. A missing or unparseable remote is a `ConfigError` that names the `environment` option as
   the fix; it fails that provider in the loader (recorded, the rest still load) and gives one failing row in `doctor`.
3. **Layer** from `detectEnvironment()` (`@theholocron/env-utils/lookup`; no second list, no second CI check):

   | Layer         | Reads                               |
   | ------------- | ----------------------------------- |
   | `local`       | `- local` (optional), then `- dev`  |
   | `development` | `- dev` (`holocron dev`)            |
   | `ci`          | `- ci`                              |
   | `production`  | `- prod`                            |
   | `test`        | none (no remote read, no `op` call) |

   `local` over `dev` is the only fallback. A layer reads its own Environment; a missing name is a missing name.

4. **Missing names.** A missing `- local` is skipped silently. A missing `- dev`, `- ci` or `- prod` is an error that
   names the Environment (names only, never values): a `LoaderError` from the loader and a failing `doctor` row.
   Only a 404-status error counts as "missing"; any other error (not signed in, timeout) is thrown as before.
5. **Order and the store.** Candidates are read in order into the credential store as `<provider>:<name>`; the store
   already makes the first source win, so `local` overrides `dev` per variable.
6. **Migration fallback (done, #2080).** `legacy-environments/` listed the old names (`Holocron`,
   `Holocron - GitHub Actions variables`) and tried them only after a required new name was missing. The Environments
   are renamed in 1Password, so the folder, its one call in `resolve-environments.ts` and the `skip` row were deleted in
   one commit. The only fallback between layers is `local` over `dev`.
7. **`doctor credentials`** inspects the same candidates with `Credentials.inspect` (names only): a variable is `ok`
   when any found Environment has it (the row says which), `fail` when none does, a required Environment that does not
   exist is its own failing row, and the `test` layer is a skip. `RunDoctorCredentialsInput` gains injectable `env` and `gitExec`, as does `PluginLoaderOptions`.
8. **Config.** The two literal `credentials` entries in `holocron.config.ts` become `credentials: ["1password"]`
   (the file gets shorter). The vault entry keeps its literal Environment (see open questions).

## Out of scope

The `concealed` flag, the `doctor` shared-value row, the deployment allowlist (#2061), org secret visibility (#2062),
renaming anything in 1Password, `githubApps`, Sentinel and Comlink configs.

## Open questions

1. **Sync entries.** Should a `repo.secrets.sync` / `repo.variables.sync` entry's `environment:` accept a layer
   (`layer: "ci"`) that derives the name? Proposed default: yes, as a follow-up once the Environments are renamed and
   #2061 has landed, because the entries name a destination's source, not the layer the machine runs in. Not done
   here; `.holocron/repo.ts` is unchanged.
2. **The `vault` entry.** The issue says "or `vault`". The vault's `environment` is used by `readSecret` and `list`
   only, and `secrets sync` takes its Environments from the sync entries, so deriving it adds little now. Proposed:
   leave it explicit and fold it into question 1.
3. **Other providers.** Only 1Password derives. A second provider (an AWS secret) would add its own rule beside
   `derivesEnvironment()`; nothing is assumed for it.
4. **`doctor variable-owners`** skips a derived entry's name (it has no literal one). Its redesign (#2058, last step)
   should list the derived names.
5. **`auth set`** prints the Environment to add a token to only when it is explicit; for a derived entry it prints
   nothing. Proposed: print the layer's first name once the rename is done.
