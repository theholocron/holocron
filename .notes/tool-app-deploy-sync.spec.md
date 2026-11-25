---
status: draft
issue: theholocron/holocron#2608
blocked-by: []
related:
  - theholocron/holocron#2061
  - theholocron/holocron#930
---

# Deploy and sync an app by name

## Problem

Deploying and syncing one of this repo's apps takes a long line with its identifiers written out:

```sh
holocron sync secrets --env prod --cwd apps/sentinel --project-id prj_VyAhqahUbk1O3wzBhhQTzrwF5cWV --target production
holocron sync secrets --env prod --cwd apps/comlink --worker comlink
pnpm --filter @theholocron/sentinel run deploy   # holocron deploy --files .vercel-deploy --project-id sentinel --target production
```

Each one repeats what the app's own `holocron.config.ts` already says: which provider it deploys with, the domain it
serves, and which secrets it takes (`repo.secrets.deploy`). Nobody remembers the project id, the Worker name or the
`--cwd`, and a wrong one is only found when the provider answers (a secret written to the wrong project). It also only
works from the place the line was written for.

## Decision

Two existing commands take an app's name in place of the flags.

```sh
holocron deploy sentinel --env prod
holocron sync   sentinel --env prod
```

- **The app is found, never listed in config.** `resolveApp(name, cwd)` reads the workspace's packages
  (`readWorkspacePackages()`), keeps those directly under `apps/` and matches the folder's name (`apps/sentinel` is
  `sentinel`). An app with no `holocron.config` of its own (Council) is still an app, with nothing declared. A package
  outside `apps/` is never matched, so a branch that shares a name with one (`docs`) is still a branch. From the repository root the name is enough; from inside `apps/sentinel` the name may be left off and the
  working folder is the app. A name that matches no app is an error that lists the ones that exist.
- **`--env` names the environments, from the standard list; there is no `all`.** The flag (alias `--environment`, the
  two are interchangeable) is repeated for more than one: `--env production --env preview`. Its values are the
  environments `@theholocron/env-utils` defines (`ENVIRONMENTS`), with its aliases (`prod` is `production`, `dev` is
  `development`), read through `environment.normalize()`. That list has no `preview`, and a preview deployment is a real
  environment (Vercel's `preview` target, Cloudflare's preview deployments), so `preview` is added to it first, as a
  deployed environment. An app command accepts the environments an app is deployed to, `production` and `preview`; both
  read their secrets from the `prod` vault layer, as `sync secrets` has always done for the two targets. The others are
  refused with the reason: `local`, `development` and `ci` are never synced (`assertSyncableLayer()`) or deployed to,
  and `test` has no deployment target. The flag is required, so nothing is written to an environment nobody named.
- **Nothing is hard-coded.** The Vercel project and the Worker script take the app folder's name (what the existing
  scripts already pass: `--project-id sentinel`). The app's own config says the provider (`deployment`, `workers`), the
  `domain` and the secrets (`repo.secrets.deploy`), as `sync secrets` already reads them.
- **A wrong name stops before it writes.** Before a deploy or a sync to a Vercel project, the project must own the app's
  configured `domain` (`Deployment.listDomains()`); if it does not, the command fails with both names and writes nothing.
  A provider with no `listDomains` skips the check with a note.
- **Per app, what there is to do:**

  | App      | `deploy <app>`                                             | `sync <app>`                                  |
  | -------- | ---------------------------------------------------------- | --------------------------------------------- |
  | Sentinel | build, stage and deploy the files to the Vercel project    | secrets to the Vercel project                 |
  | Comlink  | says its Worker is made by `setup notifications`, exits 0  | secrets to the Worker script, `COMLINK_` keys |
  | Council  | "nothing to do" (an Obsidian plugin, installed by hand), 0 | "nothing to do", 0                            |

  An app is classified by what its config declares (a `deployment` provider, `workers`, `repo.secrets.deploy`), not by
  its name, so a new app needs no change here.

- **Where the name goes.** `deploy` and `sync` already take a positional (`branch`, `steps..`). When the first value is
  the name of a workspace app, that is the app; otherwise the command behaves exactly as before. No existing step name
  or branch is an app name today, and a collision is resolved in favour of the existing meaning, with a note.
- **No new secret handling.** `sync <app>` calls `runSecretsSync()` with the arguments `sync secrets` would take, and
  `deploy <app>` calls the existing stage and `runDeployFromFiles()`. The fail-closed deploy allow-list
  (`repo.secrets.deploy`, spec `tech-deployment-key-allowlist`) is unchanged.

## What we are not doing

- **No standalone Comlink deploy.** Its Worker needs the channel webhooks, which `setup notifications` supplies; a deploy
  without them would replace a working Worker with one that cannot post. `deploy comlink` says so.
- **No `--env ci`.** `sync secrets --env ci` is the one that fills GitHub Actions secrets and variables.
- **No new config key.** A project or Worker name that differs from the folder would need an override; none does today,
  so none is added.

## Plan

1. This spec (`docs(specs)`).
2. `preview` in `@theholocron/env-utils`'s environments, with tests and docs.
3. `resolveApp()`, `--env` parsing and `deploy <app>`, with tests and docs.
4. `sync <app>`, with tests and docs.

## Unverified

- A real `deploy sentinel --env prod` and `sync <app> --env prod` against Vercel and Cloudflare: the tests use fakes.
- That `Deployment.listDomains()` for the Vercel project returns the app's `domain` in the form the config writes it.
- That the `prod` layer's values are what a preview should receive; today's `sync secrets` sends them there, and the app commands keep that.
