---
id: SPEC-0077
status: accepted
issue: theholocron/holocron#2069
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2061
discussion:
  url: https://discord.com/channels/1303969001822486568/1569942262719316159
---

# Name a layer, not a 1Password Environment, in the config

## Problem

#2063 derives the Environment of the `credentials` providers from the repository and the layer
(`<org/repo> - local|dev|ci|prod`). Everything else in the config still writes an Environment name, so none of the
renames of #2058 can start without breaking `secrets sync`, `holocron dev`, `doctor github-app` and the Sentinel sync
workflow. A config should say which layer an entry belongs to and leave the name to one derivation.

## Decision

### Shape

An entry names a `layer` (`local`, `dev`, `ci` or `prod`) where it used to name an `environment`. This covers
`repo.secrets.sync`, `repo.variables.sync`, `repo.secrets.deploy`, `githubApps[]` and `dev`, and the `vault` provider's
options (`vault: ["1password", { layer: "prod" }]`). The `credentials` entries need no option: they derive from the
machine's layer (`detectEnvironment()`), as in #2063, so `credentials: ["1password"]` is enough.

`layer` and `environment` together on one entry are a `ConfigError`, and so is a `layer` that is not one of the four
words or an `environment` that is blank. An explicit `environment` keeps working, unchanged.

### One derivation

The name is `layerEnvironment(slug, layer)` in `credentials-environments/layer-environment/`, which
`environmentLayers()` (the credentials' local-then-dev lookup) uses too. The slug is `repoSlug()` of the `origin`
remote.

`loadConfig()` calls `resolveLayers()` after the config is resolved: every `layer` becomes the `environment` it names
and the `layer` key is dropped, so the commands and the doctors (`doctor secrets`, `variables`, `github-app`,
`variable-owners`, `credentials`) see literal names and none derives one itself. The remote is read at most once, and
only when an entry names a layer, so a repository with no layer entries needs no remote. A remote that cannot be read
is a `ConfigError` that names the `environment` option as the fix; nothing is guessed. `resolveConfig()` stays
synchronous and only validates the shape, which is what Sentinel's remote config check runs.

### `secrets sync <x>`

`<x>` is a layer word or a literal Environment name. A word that is exactly `local`, `dev`, `ci` or `prod`
(case-sensitive) is the layer of this repository; anything else is a literal name. A literal name wins only when it is
not exactly a layer word, so an Environment that is itself called `prod` cannot be addressed by that name (the derived
names carry the repository and are never a bare word, so this costs nothing in practice).

### Matching `repo.secrets.deploy` and the sync entries

Entries are compared by derived name. Because `loadConfig()` has already resolved every `layer`, an entry written as
`layer: "prod"` and a run of `secrets sync prod` (derived to the same name) match, and so do a literal `environment`
and the same literal on the command line. `mergeSync()` (preset composition, before resolution) keys entries on
environment, layer and scope.

### Subdirectories

`apps/sentinel` and `apps/comlink` have their own configs and are run with `--cwd`. The git remote is found from that
directory (git walks up to the repository), so their slug is the repository's, `theholocron/holocron`. Both apps
share the `- prod` Environment; the `SENTINEL_` and `COMLINK_` prefixes, and `repo.secrets.deploy`, keep each to its own
names (#2061).

### This repository

`ci` for the secrets and variables sync (the variables Environment merges into `ci`); `prod` for Sentinel's and
Comlink's `vault`, `repo.secrets.deploy` and the sync workflow (its default input is `prod`); `githubApps` points
`Sentinel` at `prod` and `Sentinel - dev` at `dev`; `holocron dev` uses `dev`; the apps' `credentials` become
`["1password"]`. There is no fallback to the old names in this change; the maintainer renames in 1Password after it
merges (see the pull request).

## Out of scope

Deleting `credentials-environments/legacy-environments/` (done in #2080), the concealed-flag reader, the
shared-value `doctor` row, org secret visibility (#2062), splitting the shared tokens (#2059) and the redesign of
`doctor variable-owners`, which here only keeps working and lists the derived names.

## Open questions

1. A `layer` on a `credentials` entry (`["1password", { layer: "prod" }]`) is not accepted: those entries follow the
   machine's layer. A tool that must read another layer's tokens would need it.
2. Resolving at load time reads the remote for every command that loads a layered config, including `config show`. A
   checkout with no `origin` fails there rather than only in the commands that read an Environment. Resolving lazily
   in each consumer would avoid that at the cost of repeating the call.
3. A literal Environment named exactly like a layer word is unreachable from `secrets sync`.
