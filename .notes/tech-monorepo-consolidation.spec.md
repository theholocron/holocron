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

> Epic: #1200. Findings below were gathered 2026-10-22 from the org on GitHub and the local checkouts, and corrected after the discovery pass on 2026-10-28 (findings are in comments on #1201-#1218; follow-ups are #1221-#1236).

## Problem

- The 8 local repos carry ~150 generated thin-caller workflow files (147 counted locally; ~4k lines), all pinned `@main` to reusables in `theholocron/.github`. Changes take three hops: astromech in `holocron` -> `.github` -> each repo (`holocron sync github`, then `holocron repo sync`). A bad push to `.github` breaks every repo at once; a new caller can't resolve until its reusable is on `.github`'s `main` (the "bootstrap" commits); a fix was lost in a squash-merge (#242).
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
- Generalize workspace discovery (#668/#669, #1201). The scanner is `listWorkspacePackagesSync` in `@theholocron/pkg-utils` (utils repo), not astromech: it lists one level under fixed roots (`packages`, `plugins`) and throws on `.`, so it cannot express a folder that is itself a package (`observability`, `skills`, `docs/theme`). It needs a new `pkg-utils` release or a local reimplementation, so #1201 is sequenced before the utils import. Key packages by name or `relativeDir`, not folder slug, to avoid collisions.

## Decisions

1. **Versioning:** per-folder version groups, keeping current lines (clients 1.43, configs 8.8, utils 1.16, cli 5.x) with prefixed tags (`clients-v1.43.2`). Release analysis is scoped to commits touching a group's folder and its dependency closure. Folder scoping is mandatory, not optional: after an unrelated-histories merge `lastTag..HEAD` spans every group. Today `bump-versions` is hard lockstep (always bumps the root `package.json`, roots `packages`/`plugins`), `publish` hardcodes `packages/*` and `plugins/*`, and `@theholocron/semantic-release-config` accepts only `branches`, `exec`, `npm`, `assets` (`tagFormat` is `v${version}` everywhere). The plan is a `group`/`paths` option in `semantic-release-config` (`tagFormat: "<group>-v${version}"`, an analyzer wrapper that filters commits by changed files, group-scoped changelog and assets) plus `--group` on `bump-versions` and `publish`; not `multi-semantic-release` (per-package tags conflict with lockstep groups) or `semantic-release-monorepo` (no dependency closure). Estimate 2-3 days. This is the main new engineering item (#1203, #1204, #1222). The `scripts/bump-versions.mjs` mentioned in older docs no longer exists; it is `holocron package bump-versions`.
2. **Channels:** single `main` for stable; major/breaking work goes to the `alpha` prerelease branch. The current mix is a side effect of the 5.0 work, not a blocker. Import holocron's `main` and `alpha` as-is and bring the libraries onto `main`. No need to ship 5.0 first. Dry-run semantic-release per group on `main` and, for holocron, `alpha`. Of the imported repos, none has a live `alpha` branch: observability and skills declare one in `release.config.ts` but it does not exist on origin, and configs' `alpha` is a stale ancestor of `main` (do not import it).
3. **CLI is a CI tool, not pinned:** run `holocron` from the repo root only. Imported packages may keep their `@theholocron/cli` devDependency as long as the root catalog resolves it from the registry; a cycle (`cli -> env-utils -> cli`) only appears if it is linked with `workspace:*`, which pnpm/turbo reject. Remove those devDeps before ever linking cross-group with `workspace:*`. The root needs an explicit `catalogs.holocron` (the CLI only, registry-resolved) and `catalogs.docs` or the retirement of `components-doc`/`registry-doc` first, because every imported `package.json` references `catalog:holocron` (#1224). Imported per-package scripts call `holocron run ...`, which resolves each package's own pinned CLI; decide whether they move to root or turbo resolution. Whether a registry-pinned `@theholocron/cli` creates a cyclic graph is a spike (#1231).
4. **npm trusted publishers:** `holocron package publish --sync-trust` wraps `npm trust list/revoke/github`, but only partly covers the mechanism. Every mutation needs interactive browser 2FA (it stops on the first EOTP and can be re-run; bypass-2FA tokens do not work), discovery only sees `packages/*` and `plugins/*` (#1201), and it skips an entry when the workflow filename matches, so packages bound to the same `delivery.publish.yml` on their old repo would stay bound (#1221). The binding is per package to repo + workflow file, so ~85 packages need re-registering: 1-3 hours if one approval covers a batch, about a day if not. Keep the filename `delivery.publish.yml`; whether the binding holds when publishing from a `workflow_call`ed reusable is a spike (#1231).
5. **License (decided): MIT** ([ADR-0016](../docs/wiki/decisions/0016-mit-as-the-unified-license.md)). One root license, "Copyright (c) 2026 Newton Koumantzelis". iamnewton holds all human commits (bots otherwise), no third-party code was found, and no third-party GPL/AGPL runtime dependency constrains the choice. The MIT packages (`cli`, `astromech`, `datapad`, `sentinel`, the plugins) already depend at runtime on GPL-3.0 libraries (`env-utils`, `fs-utils`, `github-client`, `http-client`, ...), which is a strong reason to relicense. Published versions keep their original license. Change the `license` fields at import time, not at the end, so the monorepo never publishes a GPL-labelled release; the final cleanup removes the leftover LICENSE files. Staying repos (templates, `.github`, `.github-private`, `theholocron.github.io`, `components`, `themes`) are relicensed in one pass (#1230).
6. **Docs:** `docs/` in holocron stays the holocron docs site, a normal Astro site served at `docs.theholocron.dev/holocron`, and the folded repos' docs become subdirectories of it. `theholocron.github.io` is not touched: it keeps the org-wide contributor docs at `docs.theholocron.dev` and owns the custom domain. No per-package docs release system and no redirects (single maintainer; update `homepage` fields at import time). `components-doc` and `registry-doc` are retired, but they have more consumers than first thought: the published CLI (production dependencies, used only by `sync-readme`), 16 pages of the holocron site, `apps/sentinel` (fetches `registry-doc` from npm at check time), and devDeps in utils, configs, skills and holocron. Before `npm deprecate`: move the sentinel registry data (#1227), rework `sync-readme` and drop the CLI dependencies (#1228), and move the 16 pages onto local components (#1234). `sync-readme` is kept for reuse on the next project: it fills the install, development and releases sections of READMEs between markers from the workspace, with the repo-level packages table derived from workspace discovery. `docs-theme` and `astro-config` stay published because 7 of the 8 templates depend on them.
7. **Templates:** unchanged.

## Core requirement: Turborepo caching and affected-only CI

The consolidation only pays off if CI work is proportional to the change. Builds on spec #672 D9 (universal, astromech-generated `turbo.json`; remote cache `TURBO_TOKEN`/`TURBO_TEAM` already wired into the reusables).

- **One root `turbo.json`, generated by astromech from the task manifest**, never hand-edited; package-level `turbo.json` overrides only where needed. Tasks mirror the intent vocabulary (`delivery.build`, `verification.unitTests`, `verification.typeSafety`, `sourceQuality.*`).
- **Precise `inputs`/`outputs` per task** (tests hash `src/**`, `test/**`, configs; not READMEs/docs). `globalDependencies` limited to what truly affects everything (lockfile, root tool configs, `turbo.json`, workflow files). `dependsOn: ["^build"]` so a change in `utils/env-utils` also re-tests dependents like `cli`; that dependent closure is the "affected" set.
- **CI runs `turbo run <task> --affected`** behind `holocron run <task>`, which already prefers `turbo run` when `turbo.json` defines the task but cannot pass `--affected` today (only `--filter` reaches turbo; the composite action's `args` land after `--`). Needed (#1232): an `affected` input through the CLI args and the `holocron` composite action; `fetch-depth: 0` on the unit-test, typecheck, build and dead-code jobs (they check out at depth 1 today); an explicit base (`pull_request.base.sha` on PRs, since turbo defaults to `main` but PRs target `alpha`); and on pushes to release branches run everything, because HEAD equals the base. Local runs use the same graph and cache.
- **Caching:** Vercel remote cache (already wired) plus the `.turbo` `actions/cache` step, which already exists in `reusable/actions/setup.yml` (only the key needs review). Unaffected tasks replay from cache.
- **Required checks must still post.** Do NOT use `paths:`/`paths-ignore:` to skip workflows: a skipped required check blocks merge on the free plan (spec #672 incident 2). Workflows always trigger; jobs run `--affected` and exit green quickly when nothing is affected. One required check per task, not per package. All 7 repos use the ruleset `holocron-default-branch` with task-level contexts that already map to this; the per-package Codecov contexts do not (holocron 17, clients 14, configs 16, utils 5 stale `codecov/project/<slug>`), and rulesets take no wildcards. Require only the aggregate `codecov/patch` and `codecov/project`, with per-folder flags and `carryforward: true` and one upload per flag, before the first import (#1223). Guard the Codecov upload when a run produces no coverage files (`fail_ci_if_error: true` today).
- **Turbo inputs:** `globalDependencies` today is only `pnpm-workspace.yaml` and `tsconfig.json`; add the lockfile, root tool configs, `turbo.json` and workflow files (use `$TURBO_ROOT$/`). Unit-test `inputs` omit `test/**` and shared config. `@theholocron/*-config` resolved from the registry are not workspace deps, so only `globalDependencies` can invalidate on a config change.
- **Repo-wide non-turbo checks** (gitleaks, yamllint, alex, editorconfig-checker, commit standards) are cheap; scope them to changed files or give them root-level turbo tasks with narrow `inputs`.
- **Release and docs deploy use the same affected logic:** per-group release analysis only considers its folder and dependency closure; docs deploy only when `docs/` or its dependencies changed.
- **Verify:** Turbo's pnpm lockfile awareness marks only packages whose resolved deps changed (test on a real dependency bump), and a root-config change invalidates everything.

## Workflows and org repos

- `holocron` hosts ALL workflows and composite actions. Files carry both `on: pull_request/push` and `on: workflow_call`, so the monorepo runs them directly (no thin callers) and outside repos call the same files via `theholocron/holocron/.github/workflows/<x>.yml@workflows-v1` (moving tag or SHA; never `@main`). Expect ~6 workflow families (ci via turbo-affected, release, docs deploy, security, housekeeping, preview) instead of 20+ per repo. Caveats (#1236):
  - `inputs.*` defaults apply only to `workflow_call`/`workflow_dispatch`, so a direct run silently skips jobs gated on `inputs.run-*`; direct runs need a source for the per-repo `with:` values (manifest read or repo variables).
  - Direct runs lose the `Caller / Callee` check-name prefix (`Test / Conclusion` becomes `Conclusion`), so preserve the names or migrate the 7 rulesets in the same step.
  - Composite actions must be referenced as `theholocron/holocron/.github/actions/<x>@workflows-v1` (a called workflow cannot use `./.github/actions/...`), so they are not tested in the PR that changes them; only the workflow file is.
  - Not dual-triggerable: `platform.dispatchedCheck`, `sync-dispatch`, `delivery.previewCheck`, the hand-written `sentinel.*` workflows.
  - Release serialization: group releases push to one `main` and hit non-fast-forward errors if parallel; run groups sequentially and parse the version with `git describe --match '<group>-v*'` instead of stripping `v` (#1222).
- `.github` shrinks to static org files: community health (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, ISSUE_TEMPLATE, FUNDING, PR template), `profile/README.md`, and `workflow-templates/`. GitHub only reads starter workflows from the org `.github` repo; they become thin callers into `holocron`. Starter workflows are distinct from the template repos.
- `.github-private`: profile plus whatever internal docs stay. Decide a new home for its wiki/ADRs/specs (likely `docs`/`fern`) and for `AGENTS.md`, which all 8 local repos and all 8 templates import via sibling path `@../github-private/AGENTS.md` (it only resolves when repos are sibling checkouts); move it into holocron and leave a one-line pointer until every consumer is repointed. `notifications/discord-links.json` stays in `.github-private`: the CLI reads `<org>/.github-private/notifications/<provider>-links.json` by default and the file pairs identities.
- `theholocron.github.io` is not touched by this project (see Decision 6).
- **Transition:** existing callers (8 repos, ~112 references across the 8 templates, repos generated from templates, plus `themes`, `components` and `theholocron.github.io`) point at `theholocron/.github/...@main`. Repoint with `holocron repo sync` (#1229); keep forwarding shims in `.github` until nothing references them, then delete. The `notify` composite action is referenced but was not found in the `.github` tree (verify).
- Preserve required-check names (matched by string) or migrate rulesets in the same step.

## Migration steps

Copy the packages in, adjust the root, publish from the new location. No intermediate "nested workspace" stage.

### Step 0: root readiness (once, before the first import)

- Generalize workspace discovery (`pkg-utils`, `readWorkspacePackages()`) and the root `pnpm-workspace.yaml` globs.
- Universal generated `turbo.json` and affected-only CI (see Core requirement), and aggregate-only Codecov required checks (#1223).
- Per-group release tooling: folder-scoped commit analysis, `tagFormat` per group, a reusable root publish workflow parameterized by group (the generated `delivery.publish` reusable assumes the repo root and has no working-directory or group input; it also strips `v` from `git describe`).
- Root catalogs (`holocron`, missing defaults) and one vitest and tsdown major (#1224, #1225).
- Fix `--sync-trust` (#1221) and run the spikes in #1231 (OIDC through `workflow_call`, nested `docs`/`docs/theme` in Turbo, `--affected` exit code, registry-pinned CLI cycle).
- License is decided (MIT).

### Step 1..N: per repo (observability, skills, utils, configs, clients, docs/themes)

Recommended order: observability (one package, proves filter-repo, `catalogs.holocron`, `tagFormat`, folder-scoped release and trusted-publisher registration), skills, utils, configs, clients (most active: three releases in two days, largest catalog conflict), then docs and themes. Run the pre-import checklist first (#1226): local checkouts are stale, and several repos have unpushed branches (utils 13, clients 21).

1. **Copy with history:** `git filter-repo` (not installed locally) to keep only the package paths (`packages/*`, or the single package) and rename them into the target folder (`packages/http-client` -> `clients/http-client`) with `--path-rename` and `--tag-rename` (`v1.43.2` -> `clients-v1.43.2`); history and tags follow (dry run verified on observability, clients and utils). Drop the legacy per-package tags (about 140 in configs, 28 in utils; a blanket rename mangles them). Paths from before the packages were renamed are lost unless listed. Merge with `--allow-unrelated-histories` so the tags are reachable from `main`. Also bring over the repo's docs content (into `docs/`), `CHANGELOG`, any scripts/tests the packages need, and nothing else. Leave behind the old root dotfiles, workflows, husky, lockfile and `.github` (that is the boilerplate being removed).
2. **Adjust the root:** add the group's glob to `pnpm-workspace.yaml`; merge the repo's catalog entries into the root catalog (align conflicting ranges, e.g. vitest `^5` vs `^4`); per package, set `repository` + `directory` to the monorepo (npm provenance requires the match). Per-package eslint/tsconfig/vitest configs already extend the shared `@theholocron/*-config` packages, so they carry over unchanged. `@theholocron/cli` devDeps may stay (registry-resolved). Known breakages: clients' build scripts run `node ../../scripts/check-bundle-size.mjs` (resolves to holocron's `scripts/` after the move; move it to `clients/scripts/`) and clients' default-catalog entries need rewriting (#1224); remove the root override pinning `@theholocron/http-client` to 1.57.0; browser-targeting utils packages rely on a root eslint override; configs' `.notes` design docs and per-package CHANGELOGs must move with it. Change the `license` fields to MIT in this step.
3. **Release setup:** rename old tags to `<group>-vX.Y.Z`, configure `tagFormat` and folder scoping, add the group to the publish workflow, register npm trusted publishers for the new repo + workflow.
4. **Verify then cut over:** `pnpm install`, `turbo run build test` green; `semantic-release --dry-run` on `main` and `alpha`. Freeze the old repo, re-import any commits that landed after the copy, publish one release from the monorepo, check version and provenance on npm. Archive the old repo with a pointer. Never allow both locations to publish the same version.

### Final cleanup (once, after all groups are in)

- Single docs site in `docs/`; retire `components-doc`/`registry-doc` after their consumers are moved (Decision 6); rework `sync-readme`.
- Remove leftover per-folder LICENSE files and confirm no package still says GPL-3.0.
- Delete duplicated config left in the root; shrink `.github`, move `.github-private` content, add then remove forwarding shims.
- Triage the folded repos' open work: 12 issues and about 29 PRs (about 23 Dependabot; the earlier "~55 issues" figure was wrong). Transfer the distinct live issues, consolidate duplicates (three alex sweeps, two `@astrojs/react` build issues), close Dependabot and auto-sync PRs; do it at each group's cutover. Update `repository`, `bugs`, `homepage` and README links (about 260 references in clients, configs and utils) and the registry data before archiving.

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
- #1214 remove leftover license files (license is MIT)
- #1215 host all workflows and composite actions in `holocron`
- #1216 shrink `.github`; forwarding shims
- #1217 relocate `.github-private` docs and `AGENTS.md`
- #1218 triage issues, archive old repos, update `homepage` fields

Found during discovery

- #1221 `--sync-trust` skips packages already bound to another repo
- #1222 parse group-prefixed tags; serialize per-group releases
- #1223 require only aggregate `codecov/patch` and `codecov/project`
- #1224 root `catalogs.holocron` and missing default entries
- #1225 choose one vitest and tsdown major before importing clients
- #1226 per-repo pre-import checklist
- #1227 move the sentinel repo registry source off `registry-doc`
- #1228 rework `sync-readme` to read the workspace
- #1229 repoint template references
- #1230 relicense template and org repos to MIT
- #1231 spike: validate open assumptions before the first import
- #1232 `holocron run --affected` and SCM base plumbing
- #1233 `apps/*` skipped by bump-versions and publish
- #1234 move the 16 holocron site pages onto local components
- #1235 docs site layout and URLs
- #1236 source of `with:` inputs for directly-triggered workflows

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
- Required checks match by name on the free plan (no `workflows` ruleset); path-filtered skips would block merges, and per-package Codecov contexts multiply with every import.
- Imported packages' `catalog:holocron`/`catalog:docs` references fail `pnpm install` until the root catalogs exist; vitest 5 (clients) vs 4 (root) is a major conflict.
- Unpushed local branches (utils 13, clients 21) may hold unreleased work.
- Clients releases several times a day; freeze it late and briefly.
- Existing callers across 8 repos, 8 templates and generated repos reference `.github@main`; shims needed during transition.
- Double publishing or lost commits at cutover if the old repo is not frozen.
- Reverses the September decision to extract observability into its own repo (epic #633). The goal (reuse by other repos such as `rando`) is preserved because everything still publishes to npm.

## Open questions

- New home for `.github-private` wiki/ADRs/specs (and whether the wiki stays private); `AGENTS.md` moves into holocron.
- Whether the registry data for sentinel lives in the monorepo or is derived from the workspace (#1227).
- Which vitest and tsdown major the root takes (#1225).
- The spike questions in #1231.

Resolved: license is MIT; `theholocron.github.io` stays untouched; `sync-readme` is kept and reworked.

## Verification

- Scratch-clone dry-run of one import; `pnpm install && turbo run build test` green with no cyclic-graph error.
- `semantic-release --dry-run` per group on `main` and `alpha` yields the expected version and prefixed tag.
- `holocron new repo` still works against the unchanged template repos.
- One test PR confirms required checks post correctly.
- Affected-only CI: a README-only PR does no real work and all required checks go green; a PR touching `utils/env-utils` runs its tests plus `cli` (dependent) and skips unrelated folders; a second run of the same commit is a full cache hit (compare wall-clock against the current multi-repo CI).
