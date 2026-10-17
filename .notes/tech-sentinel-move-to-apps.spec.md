---
status: draft
issue: theholocron/holocron#1051
blocked-by: []
related:
  - theholocron/holocron#992
---

# Move Sentinel from `packages/` to `apps/`

## Problem

`packages/sentinel` is a deployed GitHub App (a Vercel function fronted by
`api/webhook.mjs`). Everything else in `packages/` is either published to npm
and consumed as a dependency, or is core infrastructure of the CLI runtime.
Sentinel is `private: true`, is never imported by anything, and ships through
`delivery.deploy`, not `semantic-release`. It is the one application in a
directory of libraries.

The `plugins/` split (`plugins-top-level-directory.spec.md`) already set the
precedent: a directory name should say what is in it.

## Decision

Move `packages/sentinel` to `apps/sentinel`. No other package moves.

The tooling already anticipates `apps/`:

- `generators/codecov` discovers `packages`, `apps` and `plugins` roots.
- `sync-properties` and the plugins spec treat `packages|apps` as workspace
  roots.
- `holocron.config` has an `apps` array (`tech-architecture.spec.md`).

## Touch points

| Area                               | Change                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace                          | add `apps/*` to `pnpm-workspace.yaml`                                                                                                                                                                                                                                 |
| Codecov                            | regenerate the component (`paths: apps/sentinel/**`)                                                                                                                                                                                                                  |
| Knip                               | rename the `packages/sentinel` workspace entry                                                                                                                                                                                                                        |
| `.gitignore`                       | `packages/sentinel/.tmp`, `.vercel-deploy`                                                                                                                                                                                                                            |
| Workflows                          | `sentinel.deploy.yml`, `sentinel.secretsSync.yml`, `delivery.previewCheck.yml`, `delivery.previewDeploy.yml` — path filters and `working-directory`; the thin-caller ones come from the generator, so fix at the source first                                         |
| `sync` / `repo setup`              | `packages/cli/src/commands/sync/sync.ts` and its comment on monorepo subpackage write locations; confirm `--cwd apps/sentinel` still resolves the git root                                                                                                            |
| `deploy-on-release`                | `workspace-packages.ts` scans `packages` and `plugins` only; add `apps` or Sentinel's release-time deploy silently stops                                                                                                                                              |
| `bump-versions`                    | scans `packages` and `plugins`; Sentinel is private so it is skipped either way, but confirm and add a test                                                                                                                                                           |
| Docs / specs                       | README, ADR 0011, `tech-sentinel-*.spec.md`, `AGENTS.md` layout block, `packages/sentinel/scripts/stage-deploy.mjs` comments                                                                                                                                          |
| `pnpm-lock.yaml`                   | regenerate and commit it in the same PR: the importer key and the workspace links are relative to `packages/sentinel`, so `pnpm install --frozen-lockfile` fails otherwise                                                                                            |
| `apps/sentinel/holocron.config.ts` | the `delivery.previewCheck` and `delivery.previewDeploy` tasks carry `with: { cwd: "packages/sentinel" }` (and the header comments mention `--cwd packages/sentinel`); change them to `apps/sentinel` or the generated preview workflows run from a missing directory |
| `package-root.ts`                  | no logic change (walks up to `node_modules`), docstring only                                                                                                                                                                                                          |
| **Vercel project**                 | change the project's _Root Directory_ setting to `apps/sentinel`                                                                                                                                                                                                      |

## Risk and sequencing

The Vercel root-directory setting is the only step that can break a live
deploy, and it is outside the repo. Order:

1. PR 1 (no behaviour change): teach `deploy-on-release`, `bump-versions`,
   workspace globs and the generators about `apps/` while Sentinel still lives
   in `packages/`. Ships and releases on its own.
2. PR 2: the `git mv`, path updates and doc updates. Merge when the Vercel
   Root Directory can be flipped at the same time; verify with a preview
   deploy and `holocron monitoring check` before merging to `main`.
3. Update the `docs` repo registry entry if it lists Sentinel's path.

## Open questions

- ~~Does anything outside this repo hard-code `packages/sentinel`?~~ Checked
  with a GitHub code search across the `theholocron` org: every match is in
  `theholocron/holocron` itself (none in `.github`, `docs`, `configs`,
  `clients`, `utils`, `observability` or `skills`). GitHub's code index can
  lag, and it does not see Vercel, Checkly or secret-store settings, so the
  Vercel Root Directory remains the one external setting to change by hand.
- Do we want `apps/` to also be where future deployables (docs site, `docs/`)
  go? `docs` is a workspace entry at the root today; out of scope here.

## Verification

- `holocron run ci` green; `pnpm --filter @theholocron/sentinel test` unchanged.
- `git grep packages/sentinel` returns nothing outside changelogs.
- A preview deploy of `apps/sentinel` passes `monitoring check`.
