<!-- editorconfig-checker-disable-file -->

# CLAUDE.md

Conventions for working on Holocron. Loaded automatically by Claude
Code into every conversation in this repo.

## Architecture

- **Capability/provider model.** 14 capabilities defined in
  `packages/cli/src/capabilities/index.ts`. Vendors implement N
  capabilities; ESLint-style `holocron.config.json` wires them up.
  `vault` is the only REQUIRED capability.
- **Plugin packages** are named `@theholocron/holocron-plugin-<provider>`.
  Each follows the proven template: `auth.ts` + `rest.ts` (or `shell.ts`
  for CLI-transport) + `capabilities/<key>.ts` + `index.ts` exporting
  `createPlugin()`.
- **Standards (codified in `.claude/skills/holocron-plugin.md`):**
    - `--dry-run` global flag flows through `RuntimeContext.dryRun`;
      commands branch at the orchestrator layer, not in capabilities.
    - `--token` global flag flows through `RuntimeContext.cliToken`;
      plugins' `auth.ts` reads it as first-precedence over env vars.
    - Cross-provider event sync uses normalized `AuthEvent` types in
      core + plugin-exported `parseWebhook(input): AuthEvent` utility
      (NOT a capability method). Swap auth providers without rewriting
      handlers.

## Code patterns

- **Adapter pattern for new vendors.** New plugins use the
  `/holocron-plugin` skill at `.claude/skills/holocron-plugin.md`. The
  skill produces ~14 files in the right shape; only the capability
  method bodies need to be filled in (REST calls / shell-outs).
- **REST clients (`rest.ts`):** bearer auth + `accept: application/json`
  headers, transport-failure wrapping (`ProviderApiError` with
  `status: 0` for `TypeError: fetch failed` etc.). Always returns
  `undefined` on 204 or when `expectNoContent: true`.
- **CLI-transport clients (`shell.ts`):** `spawnSync` wrapper with
  `stdio: ['inherit', 'pipe', 'pipe']` (the inherit stdin matters —
  it gives the vendor CLI a TTY signal so biometric / interactive
  prompts work locally; CI sees no TTY and behaves accordingly).
- **Soft-skip over hard-fail when a capability fails.** Orchestrator
  commands (`setup`, `secrets sync`, `doctor`) wrap each step in
  `try/catch` and continue; final summary reports `ok / fail / skip`
  counts. Per-step failure does not abort the run.
- **Idempotent capability operations.** Probe-then-act, treat
  "already exists" / 409 / EPRECONDITION as success, never blow up
  on re-runs.
- **`holocron.config.json` is the contract.** No hardcoded vendor
  lists, no hardcoded paths, no implicit assumptions. Config drives
  loader; loader drives commands.

## Workflow

- **Commits use Conventional Commits.** `feat:` / `fix:` /
  `chore(scope):` / `docs:` / `ci:` / `test:` / `refactor:` /
  `perf:` — semantic-release parses these to compute the next
  version on push-to-main.
- **Always `git commit --signoff` (or `-s`).** DCO is enforced; the
  `Signed-off-by:` trailer is required on every commit. `-s`
  generates it automatically from `git config user.name` + `email`.
- **No Claude attribution in commits / PRs / issues / docs.** No
  footer, no Co-Authored-By trailer. The author is the user.
- **One PR = one focused change = one squashed commit = one release.**
  Squash-merge by default. The PR title becomes the squashed commit
  subject, which semantic-release uses for the changelog. Write
  meaningful PR titles that follow Conventional Commits.
- **Discuss → `.notes/<topic>.spec.md` → GitHub issue.** Non-trivial
  decisions get a spec file in `.notes/` before acting. Same lifecycle
  as Rando (`draft → proposed → approved → archived`). Spec name
  prefixes: `tech-` / `tool-` / `process-` / `ci-` / `security-`.
- **File issues for non-trivial work** and reference in commits/PRs
  (`Closes #N` / `Refs #N`). Skip for typo fixes.

## Quality

- **Run `pnpm typecheck && pnpm lint && pnpm test` before declaring
  work done or drafting a commit message.** Non-negotiable. CI runs
  the same set + `pnpm build` via `.github/workflows/ci.yml`;
  finding out from a failed CI after pushing wastes a round trip.
- **Test patterns:** vitest across all packages. Plugins use
  `stubFetch` (REST plugins) or `stubSpawn` (CLI plugins) — both
  ported from rando-id/rando.id `__tests__/helpers.ts`. Per-plugin
  coverage floor: 90%+ lines on the auth + REST/shell + capability
  surface. The `cli-utils` package is `private: true` (v1 carryover);
  its typecheck is a no-op.
- **Don't call `expect(...).toThrow()` twice on the same stubbed call.**
  The stub queue advances per call; second invocation gets the default
  empty response and the assertion silently passes (or fails for the
  wrong reason). Use a single `try/catch` with property assertions
  on the caught error instead. Captured in the skill's non-negotiables.
- **PR checks must be green before merge.** `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build` all run on `ci.yml`. CodeQL
  runs separately. DCO checks the Signed-off-by trailer per commit
  (use `-s`). Don't merge through red checks.

## Releases (automated)

- **semantic-release on push to main.** Walks Conventional Commits
  since the last tag, computes the next version, bumps all 7 public
  packages in lockstep via `scripts/bump-versions.mjs`, publishes
  via OIDC, creates a GitHub Release, commits `CHANGELOG.md`.
- **npm Trusted Publishing.** OIDC token exchange at publish time —
  no `NPM_TOKEN` secret anywhere. Each package has a Trusted
  Publisher registered on npmjs.com (Publisher: GitHub Actions,
  Repo: theholocron/holocron, Workflow: release.yml).
- **First publish for a new package** uses `holocron npm
publish-initial` (chicken-and-egg: trusted publishing needs the
  package to exist first). Workflow: `npm login --auth-type=web`
  → `pnpm install && pnpm build` → `pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp <code>`.

## Repo layout

```
packages/
  cli/                            — @theholocron/cli                       (binary + runtime + 14 capability interfaces)
  cli-utils/                      — @theholocron/cli-utils                 (PRIVATE — v1 carryover)
  holocron-plugin-github/         — source / ci / secrets / environments / issues
  holocron-plugin-vercel/         — deployment
  holocron-plugin-neon/           — storage
  holocron-plugin-clerk/          — auth (+ parseWebhook utility)
  holocron-plugin-1password/      — vault (CLI shell-out — only non-REST plugin)
  holocron-plugin-postman/        — tooling
holocron.config.json              — this repo's own config (self-hosted)
.notes/                           — design specs (draft → proposed → approved → archived)
.claude/skills/holocron-plugin.md — scaffolding skill for new plugins
.github/workflows/                — ci.yml (PR), release.yml (main), codeql.yml, etc.
scripts/bump-versions.mjs         — lockstep version bump invoked by semantic-release
```

## What's deliberately out of scope (for now)

These are real future work captured as tracking issues — DO NOT
build them speculatively; pick up the issue when ready.

- **#75** Shareable configs (per-capability + whole-config presets,
  ESLint-`extends`-style)
- **#76** Per-plugin `transport: 'rest' | 'cli'` option
- **#77** `holocron plugin create` CLI command (promote the
  scaffolding skill to a first-class CLI feature)
- **#78** CLI-transport sibling skill
- **#79** Multi-plugin `--token` disambiguation
- **#80** Real Svix HMAC verification in `parseWebhook`
- **#81** `defineConfig({})` API + JS/TS config file format
- **#82** Extend `holocron setup` with repo policy + branch protection
