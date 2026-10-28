---
status: draft
issue: theholocron/holocron#1200
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#633
  - theholocron/holocron#668
  - theholocron/holocron#669
---

# Consolidate the core org repos into the `holocron` monorepo

> Epic: #1200. Findings below were gathered 2026-10-22 from the org on GitHub and the local checkouts.

## Problem

- 8 local repos carry 160 generated thin-caller workflow files (~4k lines), all pinned `@main` to reusables in `theholocron/.github`. Changes take three hops: astromech in `holocron` -> `.github` -> each repo (`holocron sync github`, then `holocron repo sync`). A bad push to `.github` breaks every repo at once; a new caller can't resolve until its reusable is on `.github`'s `main` (the "bootstrap" commits); a fix was lost in a squash-merge (#242).
- ~8 pnpm catalogs drift. Each repo pins a different holocron alpha (`alpha.3`, `alpha.153`, local `alpha.185`). TypeScript, tsdown, vitest, astro, prettier and turbo ranges differ per repo.
- A registry-mediated dependency cycle: `holocron` consumes clients, utils, configs, observability and docs; each of those dev-depends on `@theholocron/cli`.
- ~15 config files are byte-identical across 5-8 repos (CODEOWNERS, `.gitleaks.toml`, `.editorconfig`, devmoji, dependabot, husky, ...), and ~7 more have small variants.
- Org has a single human contributor (iamnewton in every repo) and is on the free plan, so per-repo isolation and permissions buy nothing.

## Scope

- **Fold in:** holocron, observability, clients, configs, utils, skills, docs, themes (themes folds into `docs/theme`). Everything folded is used by this repo or used to build its work.
- **Stay as they are:**
  - All 8 `*-template` repos (`base`, `node`, `cli`, `react`, `nextjs`, `monorepo`, `monorepo-react`, `monorepo-nextjs`). The GitHub template flag is the feature; `holocron new` runs `gh repo create --template ${org}/${type}-template`. Making them externally presentable (e.g. not hard-coding `theholocron/.github/...@main`) is a follow-up project after this conversion.
  - `.github`, `.github-private`, `theholocron.github.io` (name-locked by GitHub).
  - `components` (React components; not used by this repo, old npm + changesets CI). Revisit if it starts being consumed here.
- Design principle: the repos should be outward-facing examples of what a non-org repo looks like.

## Target layout

Each former repo becomes a root folder whose children are the packages (no `packages/` level). npm package names do not change; only directories move.

```
apps/           sentinel (existing)
cli/            cli, astromech, datapad (holocron's current packages/*; packages/ dissolves)
clients/        http-client, github-client, ...
configs/        eslint-config, tsconfig, ...
docs/           the one plain Astro/Starlight site; docs/theme = docs-theme (still published)
fern/           existing
media/          existing
observability/  single package (the folder is the package)
plugins/        holocron-plugin-* (existing)
skills/         single package (the folder is the package)
utils/          array-utils, ...
```

- One `pnpm-workspace.yaml` and one catalog; `workspace:*` within a group.
- Workspace globs: `cli/*`, `clients/*`, `configs/*`, `utils/*`, `plugins/*`, `apps/*`, `docs/theme`, `observability`, `skills`.
- Generalize `astromech` `readWorkspacePackages()`; it scans only `packages/*` (#668/#669).

## Decisions

1. **Versioning:** per-folder version groups, keeping current lines (clients 1.43, configs 8.8, utils 1.16, cli 5.x) with prefixed tags (`clients-v1.43.2`). Release analysis is scoped to commits touching a group's folder and its dependency closure. Work lands in `holocron bump-versions` / `publish`. This is the main new engineering item.
2. **Channels:** single `main` for stable; major/breaking work goes to the `alpha` prerelease branch. The current mix is a side effect of the 5.0 work, not a blocker. Import holocron's `main` and `alpha` as-is and bring the libraries onto `main`. No need to ship 5.0 first. Dry-run semantic-release per group on both branches.
3. **CLI is a CI tool, not pinned:** run `holocron` from the repo root only. Imported packages may keep their `@theholocron/cli` devDependency as long as the root catalog resolves it from the registry; a cycle (`cli -> env-utils -> cli`) only appears if it is linked with `workspace:*`, which pnpm/turbo reject. Remove those devDeps before ever linking cross-group with `workspace:*`.
4. **npm trusted publishers:** the CLI publish tooling (`packages/cli/src/commands/publish`, `run-steady-publish`) already covers the mechanism. The OIDC binding is per package to repo + workflow file, so ~85 packages need re-registering; confirm the tool can do it in bulk and that the new workflow filename is accepted.
5. **License:** one root license. iamnewton holds all human commits, so relicensing is feasible. Recommend MIT (holocron, observability, skills are already MIT; GPL-3.0 on the utils/configs/clients libraries encumbers consumers). Published versions keep their original license. Confirm before importing.
6. **Docs:** one `docs/` directory that is a normal Astro site. No per-package docs release system and no URL redirects (single consumer; update `homepage` fields). `components-doc` and `registry-doc` are retired: their components become local to the site, and their one CLI consumer (`packages/cli/src/commands/sync-readme/sync-readme.ts`: `generateReadme`, `getClients/getConfigs/...`) is reworked to derive package tables from the workspace, or dropped. `npm deprecate` both. `docs-theme` and `astro-config` stay published because the node/cli/nextjs/monorepo templates depend on them. Decide later whether `theholocron.github.io` becomes a landing page or the Pages deploy target.
7. **Templates:** unchanged.

## Core requirement: Turborepo caching and affected-only CI

The consolidation only pays off if CI work is proportional to the change. Builds on spec #672 D9 (universal, astromech-generated `turbo.json`; remote cache `TURBO_TOKEN`/`TURBO_TEAM` already wired into the reusables).

- **One root `turbo.json`, generated by astromech from the task manifest**, never hand-edited; package-level `turbo.json` overrides only where needed. Tasks mirror the intent vocabulary (`delivery.build`, `verification.unitTests`, `verification.typeSafety`, `sourceQuality.*`).
- **Precise `inputs`/`outputs` per task** (tests hash `src/**`, `test/**`, configs; not READMEs/docs). `globalDependencies` limited to what truly affects everything (lockfile, root tool configs, `turbo.json`, workflow files). `dependsOn: ["^build"]` so a change in `utils/env-utils` also re-tests dependents like `cli`; that dependent closure is the "affected" set.
- **CI runs `turbo run <task> --affected`** (full-depth checkout so the base ref exists) behind `holocron run <task>`, which already prefers `turbo run` when `turbo.json` defines the task. Local runs use the same graph and cache.
- **Caching:** Vercel remote cache (already wired) plus `.turbo` via `actions/cache` as fallback. Unaffected tasks replay from cache.
- **Required checks must still post.** Do NOT use `paths:`/`paths-ignore:` to skip workflows: a skipped required check blocks merge on the free plan (spec #672 incident 2). Workflows always trigger; jobs run `--affected` and exit green quickly when nothing is affected. One required check per task, not per package (today `utils` lists `codecov/project/array`, `/fs`, ...). Codecov uses per-folder flags with `carryforward: true`.
- **Repo-wide non-turbo checks** (gitleaks, yamllint, alex, editorconfig-checker, commit standards) are cheap; scope them to changed files or give them root-level turbo tasks with narrow `inputs`.
- **Release and docs deploy use the same affected logic:** per-group release analysis only considers its folder and dependency closure; docs deploy only when `docs/` or its dependencies changed.
- **Verify:** Turbo's pnpm lockfile awareness marks only packages whose resolved deps changed (test on a real dependency bump), and a root-config change invalidates everything.

## Workflows and org repos

- `holocron` hosts ALL workflows and composite actions. Files carry both `on: pull_request/push` and `on: workflow_call`, so the monorepo runs them directly (no thin callers; tested in the PR that changes them) and outside repos call the same files via `theholocron/holocron/.github/workflows/<x>.yml@workflows-v1` (moving tag or SHA; never `@main`). Expect ~6 workflow families (ci via turbo-affected, release, docs deploy, security, housekeeping, preview) instead of 20+ per repo.
- `.github` shrinks to static org files: community health (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, ISSUE_TEMPLATE, FUNDING, PR template), `profile/README.md`, and `workflow-templates/`. GitHub only reads starter workflows from the org `.github` repo; they become thin callers into `holocron`. Starter workflows are distinct from the template repos.
- `.github-private`: profile plus whatever internal docs stay. Decide a new home for its wiki/ADRs/specs (likely `docs`/`fern`) and for `AGENTS.md`, which every repo's `CLAUDE.md` imports via sibling path `@../github-private/AGENTS.md`.
- **Transition:** existing callers (8 repos, 8 templates, repos generated from templates) point at `theholocron/.github/...@main`. Repoint with `holocron repo sync`; keep forwarding shims in `.github` until nothing references them, then delete.
- Preserve required-check names (matched by string) or migrate rulesets in the same step.

## Migration steps

Copy the packages in, adjust the root, publish from the new location. No intermediate "nested workspace" stage.

### Step 0: root readiness (once, before the first import)

- Generalize `astromech` `readWorkspacePackages()` and the root `pnpm-workspace.yaml` globs.
- Universal generated `turbo.json` and affected-only CI (see Core requirement).
- Per-group release tooling: folder-scoped commit analysis, `tagFormat` per group, a reusable root publish workflow parameterized by group (check whether the generated `delivery.publish` reusable assumes the repo root and needs a working-directory input).
- Pick the license and confirm trusted-publisher bulk registration works.

### Step 1..N: per repo (observability, skills, utils, configs, clients, docs/themes)

1. **Copy with history:** `git filter-repo` to keep only the package paths (`packages/*`, or the single package) and rename them into the target folder (`packages/http-client` -> `clients/http-client`); history follows. Also bring over the repo's docs content (into `docs/`), `CHANGELOG`, any scripts/tests the packages need, and nothing else. Leave behind the old root dotfiles, workflows, husky, lockfile and `.github` (that is the boilerplate being removed).
2. **Adjust the root:** add the group's glob to `pnpm-workspace.yaml`; merge the repo's catalog entries into the root catalog (align conflicting ranges, e.g. vitest `^5` vs `^4`); per package, set `repository` + `directory` to the monorepo (npm provenance requires the match). Per-package eslint/tsconfig/vitest configs already extend the shared `@theholocron/*-config` packages, so they carry over unchanged. `@theholocron/cli` devDeps may stay (registry-resolved).
3. **Release setup:** rename old tags to `<group>-vX.Y.Z`, configure `tagFormat` and folder scoping, add the group to the publish workflow, register npm trusted publishers for the new repo + workflow.
4. **Verify then cut over:** `pnpm install`, `turbo run build test` green; `semantic-release --dry-run` on `main` and `alpha`. Freeze the old repo, re-import any commits that landed after the copy, publish one release from the monorepo, check version and provenance on npm. Archive the old repo with a pointer. Never allow both locations to publish the same version.

### Final cleanup (once, after all groups are in)

- Single docs site in `docs/`; retire `components-doc`/`registry-doc`; rework or drop `sync-readme`.
- Unify the license (remove per-folder LICENSE files).
- Delete duplicated config left in the root; shrink `.github`, move `.github-private` content, add then remove forwarding shims.
- Transfer/triage ~55 open issues, update package `homepage` fields.

## Work breakdown (epic #1200)

Step 0: root readiness

- #1201 workspace package discovery beyond `packages/*`
- #1202 universal generated `turbo.json` and affected-only CI
- #1203 per-group release tooling
- #1204 parameterized publish workflow per group
- #1205 bulk npm trusted-publisher registration
- #1206 decide the unified license

Per repo

- #1207 observability
- #1208 skills
- #1209 utils
- #1210 configs
- #1211 clients
- #1212 docs and themes (`docs/theme`)

Final cleanup

- #1213 single docs site; retire `components-doc` / `registry-doc`
- #1214 unify the license
- #1215 host all workflows and composite actions in `holocron`
- #1216 shrink `.github`; forwarding shims
- #1217 relocate `.github-private` docs and `AGENTS.md`
- #1218 triage issues, archive old repos, update `homepage` fields

## Time estimate (author's estimate, solo maintainer, not measured)

| Chunk                                                                     | Estimate                                      |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| Step 0: root readiness (astromech scan, turbo, per-group release tooling) | 1-2 weeks (the unknown)                       |
| Per repo copy + root adjust + release setup + cutover                     | 1-2 days each (~1 week for the 5 larger ones) |
| Workflows, affected-only CI, required checks, Codecov                     | 3-5 days + tuning                             |
| Trusted-publisher re-registration                                         | 1-2 days (more if not bulk)                   |
| Docs consolidation, `sync-readme` rework                                  | 2-4 days                                      |
| Org repos, shims, issues, archive                                         | 2-3 days                                      |

Roughly 3-5 focused weeks (4-6 calendar with 5.0 alpha work in flight). Repos fold in independently, so the first group can publish from the monorepo soon after Step 0, and the old repo is the rollback until each cutover is verified.

## Risks

- Per-group release analysis does not exist yet; it is the main engineering item.
- One bad commit to the CLI can block every group's release; keep a manual publish fallback.
- Required checks match by name on the free plan (no `workflows` ruleset); path-filtered skips would block merges.
- Existing callers across 8 repos, 8 templates and generated repos reference `.github@main`; shims needed during transition.
- Double publishing or lost commits at cutover if the old repo is not frozen.
- Reverses the September decision to extract observability into its own repo (epic #633). The goal (reuse by other repos such as `rando`) is preserved because everything still publishes to npm.

## Open questions

- MIT vs GPL-3.0 for the unified license.
- Role of `theholocron.github.io` after docs consolidation.
- New home for `.github-private` wiki/ADRs/specs and `AGENTS.md`.
- Whether `sync-readme` is reworked or dropped.
- Bulk trusted-publisher registration in the existing CLI tooling.

## Verification

- Scratch-clone dry-run of one import; `pnpm install && turbo run build test` green with no cyclic-graph error.
- `semantic-release --dry-run` per group on `main` and `alpha` yields the expected version and prefixed tag.
- `holocron new repo` still works against the unchanged template repos.
- One test PR confirms required checks post correctly.
- Affected-only CI: a README-only PR does no real work and all required checks go green; a PR touching `utils/env-utils` runs its tests plus `cli` (dependent) and skips unrelated folders; a second run of the same commit is a full cache hit (compare wall-clock against the current multi-repo CI).
