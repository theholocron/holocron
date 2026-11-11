<!-- editorconfig-checker-disable-file -->

# theholocron — agent operating contract

Org-level agent conventions for all `theholocron` repositories. The canonical
copy is `.holocron/org.md` in `theholocron/holocron`. `holocron sync` writes
it into each repo's `AGENTS.md` between generated markers, so no repo needs a
sibling checkout to read it; holocron itself imports it with `@.holocron/org.md`.
Edit it in holocron, then run `holocron sync`.

## Repo map

Each concern lives in exactly one repo:

| Concern                                                           | Repo                                      |
| ----------------------------------------------------------------- | ----------------------------------------- |
| Shareable tool config (ESLint, Prettier, TSConfig, Vitest, …)     | `theholocron/holocron` (`configs/`)       |
| HTTP clients and API wrappers                                     | `theholocron/holocron` (`clients/`)       |
| Infrastructure automation, CI orchestration, repo lifecycle       | `theholocron/holocron`                    |
| Org-level CI workflows, composite actions, community health files | `theholocron/.github`                     |
| Internal member docs and private org config                       | `theholocron/.github-private` (this repo) |
| Shared agent skills registry                                      | `theholocron/holocron` (`skills/`)        |

If you find yourself copy-pasting a tool config across repos, it belongs in
the `configs/` folder of `theholocron/holocron`. If you find yourself writing a new
automation command, it belongs in `holocron` too. Generic helpers (`utils/`) and
observability (`observability/`) live in that monorepo as well.

### `holocron.config` format

- Repos **with** a `package.json` → `holocron.config.ts` with `defineConfig`
  from `@theholocron/cli`. The CLI must be resolvable at runtime for the TS
  format to work.
- Repos **without** a `package.json` (e.g. `.github`, `.github-private`) →
  `holocron.config.json`.

## Workflow

- **Always open a PR — never push directly to the default branch.** Even for
  small fixes: create a branch, push it, open a PR. This lets CI run, keeps
  history reviewable, and respects branch protection. The only exception is
  bootstrapping a brand-new repo before protection is set up.
- **Conventional Commits.** `feat:` / `fix:` / `chore:` / `docs:` / `ci:` /
  `test:` / `refactor:` / `perf:` — semantic-release uses these for versioning
  and changelogs. Repos without a release step use the subset relevant to them.
- **Always `git commit -s`** (DCO). The `Signed-off-by:` trailer is required
  on every commit. `-s` generates it automatically from `git config user.name`
  and `user.email`.
- **Always rebase, never merge `main`.** Use `git rebase origin/main` to keep a
  branch current. `git merge main` creates an unsigned merge commit and drags bot
  commits into the PR history — both trigger DCO check failures.
- **No Claude attribution** in commits, PRs, issues, or docs. No
  `Co-Authored-By` trailer. The author is the user.
- **One PR = one focused change.** Squash-merge; the PR title becomes the
  squashed commit subject that semantic-release reads.
- **File issues for non-trivial work** and reference them in commits/PRs
  (`Closes #N` / `Refs #N`). Skip for typo fixes.
- **Spec process: Issue before spec.** Before writing a spec file, file an issue
  first, in the tracker the config's `issues` provider names (GitHub when the
  config sets no `issues` provider). The issue is the durable tracking artifact.
  The spec's frontmatter `issue:` field must reference it. Order: Issue → Spec →
  PR → Review → merge.
- **Reference the issue in that tracker's syntax** in commits and the PR: `Closes #N`
  / `Refs #N` for GitHub, the issue key (`Closes ENG-42` / `Refs ENG-42`) for Linear.

## Before starting any coding task

1. Verify you are on a feature branch, not `main`. If on `main`, create a branch
   first. Never commit directly to `main`. If on an existing feature branch, run
   `git fetch origin && git rebase origin/main` to ensure it has the latest from
   `main` — never start work on a stale branch.
2. Any PR that adds new behavior must include tests and documentation in the same
   PR. Do not open docs-only or test-only follow-up PRs — tests and docs ship with
   the feature. This applies to new packages, capabilities, commands, APIs, and
   any observable behavior change.
3. If adding a new client or plugin package, update the docs-theme registry in
   the same PR or a cleanly scoped immediate follow-up.
4. One PR per logical change. Do not bundle unrelated fixes with a feature.

## After completing any coding task

1. Confirm you are still on the intended feature branch.
2. Confirm all checklist items in any invoked skill are complete.
3. Confirm CI is green before requesting review.

## CI workflows

All reusable workflow implementations and composite actions **live as source in
`theholocron/holocron` — `packages/astromech/src/templates/reusable/`** and are
generated + pushed to `theholocron/.github` by `holocron sync github`.
**`theholocron/.github` and `.github-private` are pure sync targets** — never
hand-edit their `.github/workflows/*`, `.github/actions/*` or
`workflow-templates/*`; edit the source in `holocron` and merge.

Every other repo (`configs`, `clients`, `holocron`, `.github-private`) gets
**thin callers** — lightweight `.github/workflows/` files that delegate to
`.github` via `uses: theholocron/.github/.github/workflows/<name>.yml@main` and
`secrets: inherit`. Thin callers are generated from the manifest by
`astromech.thinCallers()` (`holocron sync` / `holocron setup`).

### Sync

The `sync-workflow-templates` workflow in `theholocron/holocron` keeps thin
callers up to date. It runs automatically on push to `main` when
`packages/cli/src/templates/**` or `packages/astromech/src/templates/**` change.
Changes to other parts of the sync machinery (e.g. `sync-github.ts`) require a
manual dispatch:

```sh
gh workflow run sync-workflow-templates.yml --repo theholocron/holocron --ref main
```

### Per-repo task list

Each secondary repo controls which tasks (and their CI workflows) it
receives — and can supply per-task `with:` overrides — via the `tasks`
array in its `holocron.config.ts` (or `holocron.config.json`).
`@theholocron/astromech` reads it as the single source for `holocron run`
/ `holocron run ci` / the generated workflow thin callers:

```typescript
tasks: ["lint", { name: "release", with: { "run-build": false } }];
```

Only add a task if the corresponding capability exists in the repo:

| Task          | Requires                                          |
| ------------- | ------------------------------------------------- |
| `test`        | vitest suite with `--coverage`                    |
| `typecheck`   | TypeScript (`pnpm typecheck` script)              |
| `audit`       | a bundle build step (`pnpm build` script)         |
| `sync-github` | `packages/cli/src/templates/**` — `holocron` only |

### Release workflow — npm prefix and registry-url

**Never run `npm config set prefix <path>` in a release workflow.** It writes
`prefix=<path>` to `~/.npmrc`, which pnpm reads for npm configuration. With a
non-default prefix set, pnpm cannot locate the registry auth it needs to perform
the GitHub OIDC token exchange and fails with `ENEEDAUTH` — even when Trusted
Publishers are correctly configured on npmjs.com.

Node.js from `hostedtoolcache` already provides a user-writable npm prefix on
PATH. Run `npm install -g <pkg>` directly.

**Never cache `~/.npm-global` or any npm global directory in release workflows.**
A stale cache restores old auth config that poisons the OIDC exchange.

**Never set `registry-url` in the shared `setup-node` composite action.** It
causes `actions/setup-node` to write `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`
to a temp `.npmrc` and set `NPM_CONFIG_USERCONFIG` pointing at it. pnpm then
reads that file, fails env-var substitution when the token is empty, and loses
auth entirely.

The reference implementation is `theholocron/holocron`'s own release workflow —
no prefix step, no cache, no `registry-url`.

### Discarding a bad sync PR

**Delete the branch, don't only close the PR.** A closed-but-existing branch
blocks future PR creation — GitHub returns 422 "A pull request already exists"
and the sync silently skips opening a new one.

```sh
gh pr close <n> --repo <owner>/<repo> --delete-branch
```

## Code standards

### Package manager

**pnpm only.** Never use `npm` or `yarn`. Run workspace-wide tasks through
Turbo (`pnpm test`, `pnpm build`, etc.); run single-package tasks with
`pnpm --filter <name> <script>`.

### TypeScript

**No `any`.** Use `unknown` for values of genuinely unknown shape and narrow
with type guards. Use generics instead of `any` in function signatures.
`as never` and `as unknown as T` are acceptable for internal casts where the
type system can't follow; `any` is not.

### Node.js version

`engines.node` must be set in every `package.json`. To update the Node.js
version across a repo run `holocron upgrade node <to>` from any repo that has
the CLI installed — it patches `engines.node`, `@types/node`, `.nvmrc`,
`.node-version`, and `.github/workflows/*.yml` automatically.

### `.alexrc.json`

**Generated by `holocron setup` — do not edit manually.** The canonical
allow-list lives in `ALEX_CONFIG` in
`theholocron/holocron · packages/cli/src/inclusive-language/config.ts`. To
allow a new term across all repos: edit that constant, open a PR in
`holocron`, merge, then re-run `holocron setup` in each consuming repo.

### Running `holocron setup`

Install `@theholocron/cli` and `@theholocron/holocron-plugin-github` under
`catalogs.holocron` in `pnpm-workspace.yaml`:

```yaml
catalogs:
  holocron:
    "@theholocron/cli": <version>
    "@theholocron/holocron-plugin-github": <version>
```

Then run:

```sh
GITHUB_TOKEN=$(gh auth token) \
HOLOCRON_ORG_TOKEN=$(security find-generic-password -s "com.theholocron.cli" -a "github.org" -w) \
pnpm exec holocron setup --token $(security find-generic-password -s "com.theholocron.cli" -a "github.admin" -w)
```

All tokens are stored in the macOS keychain under service `com.theholocron.cli`. See `docs/tokens.md` in the `holocron` repo for the full token matrix and required scopes.

Bump both catalog entries together when upgrading — they publish in lockstep.

### README structure

Every repo README follows this layout. Use `holocron sync readme` to regenerate the Installation + Usage block automatically.

```markdown
# Package Name

<!-- holocron:description -->

One-line description (synced from holocron.config.ts description field).
<!-- /holocron:description -->

<!-- holocron:installation -->

## Installation

...generated from package.json bin / exports...

## Usage

...generated from package.json bin / exports...
<!-- /holocron:installation -->

## What's Included ← template repos only; omit for libraries

...feature table...

## Development

pnpm scripts table or code block

## Releases

Automated via semantic-release. Link to CHANGELOG.md.

## Documentation

Link to docs site.
```

**Rules:**

- Never write "Getting Started" — use separate "Installation" and "Usage" headings.
- The `<!-- holocron:description -->` and `<!-- holocron:installation -->` marker blocks must stay in sync with the config/package; run `holocron sync readme` after changing `description` in `holocron.config.ts` or `bin` in `package.json`.
- The "What's Included" section belongs only in template repos (cli-template, node-template, react-template, etc.) where it describes what the template ships. Library and app repos omit it.

---

## This repo (`.github-private`)

> **Local path:** `~/Code/theholocron/github-private/`
> **GitHub repo:** `theholocron/.github-private`

Internal member documentation and private org-level configuration for the
`theholocron` org. Content here is only visible to org members.

Conventional Commit types used here: `docs:` for content changes, `ci:` for
workflow changes, `chore:` for maintenance.

No test suite (documentation repo). `pnpm lint` runs `yamllint` on workflow
files. Branch protection on `main` requires DCO and passing CI checks.
