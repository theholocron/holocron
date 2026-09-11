<!-- editorconfig-checker-disable-file -->

# theholocron/holocron — agent operating contract

`CLAUDE.md` is a symlink to this file, so Claude, Codex, and every other agent
read the same rules. Put durable, repo-wide agent guidance here.

@../github-private/AGENTS.md

## Where code lives (org-wide rule)

Three repos, one rule per concern:

- **Shareable tool config (ESLint, Prettier, TSConfig, Vitest, …)** → `theholocron/configs`. If you find yourself copy-pasting a tool config across repos, it belongs there as a `@theholocron/*-config` package.
- **HTTP clients and API wrappers** → `theholocron/clients`. REST clients for third-party services and shared HTTP primitives live there.
- **Anything that can be automated** → `theholocron/holocron` (this repo). Infrastructure commands (`setup`, `upgrade`, `doctor`, `secrets sync`), CI orchestration, and repo lifecycle automation belong here in the Holocron CLI.
- **`holocron.config` format** — use `holocron.config.ts` with `defineConfig` in any repo that has a `package.json` (the CLI must be resolvable at runtime). Use `holocron.config.json` in content-only repos with no Node.js infrastructure (e.g., `.github`, `.github-private`).

## Architecture

- **Capability/provider model.** 14 capabilities defined in
  `packages/cli/src/capabilities/index.ts`. Vendors implement N
  capabilities; ESLint-style `holocron.config.{json,js,ts}` wires them
  up. Use `defineConfig` from `@theholocron/cli` in JS/TS configs for
  typed autocomplete. `vault` is no longer required (removed constraint).
- **Plugin packages** are named `@theholocron/holocron-plugin-<provider>`.
  Each follows the proven template: `auth.ts` + `rest.ts` (or `shell.ts`
  for CLI-transport) + `capabilities/<key>.ts` + `index.ts` exporting
  `createPlugin()`.
- **Task manifest → `@theholocron/astromech`** (ADR-0009, epic #581). One
  `tasks` array in `holocron.config` drives every workflow surface:
  `holocron run` / `holocron ci`, each repo's `.github/workflows/*.yml`
  thin callers (`astromech.thinCallers()`, consumed by `holocron sync` /
  `holocron setup`), `package.json` scripts, the linter set, the
  branch-protection required checks, and the reusable `workflow_call`
  implementations pushed to `theholocron/.github`
  (`astromech.reusableTemplates()`, consumed by `holocron sync-github`).
  The loop closes both ways: the reusable `typecheck` / `test` / `audit`
  workflows run their core step through the `holocron` composite action
  (`holocron run <task> [job]`), so CI executes the same command a
  contributor runs locally.
  **`theholocron/.github` and `.github-private` are pure sync targets** —
  their `.github/workflows/*`, `.github/actions/*` and `workflow-templates/*`
  are generated from `packages/astromech/src/templates/` and pushed by
  `holocron sync-github`; edit the source here, never those repos directly.
- **Standards (codified in `.claude/skills/holocron-skill-plugin/`):**
  - `--dry-run` global flag flows through `RuntimeContext.dryRun`;
    commands branch at the orchestrator layer, not in capabilities.
  - `--token` global flag is repeatable. Bare form (`--token <value>`)
    sets `RuntimeContext.cliToken` as fallback for all plugins. Keyed
    form (`--token vendor=value`, repeated per provider) sets
    `RuntimeContext.cliTokens`; `PluginLoader` routes each entry to
    the matching plugin by `tuple.provider`, falling back to `cliToken`
    for unmatched providers. Plugins always receive a single `cliToken`.
  - Cross-provider event sync uses normalized `AuthEvent` types in
    core + plugin-exported `parseWebhook(input): AuthEvent` utility
    (NOT a capability method). Swap auth providers without rewriting
    handlers.
  - **Execution context** (`packages/cli/src/commands/contexts.ts`,
    spec `tech-cli-execution-contexts`, #576). Every command is tagged
    `global` (binary only), `repo-aware` (`./holocron.config`, no
    plugins) or `workspace` (plugin packages resolvable). New commands
    MUST get a `COMMAND_CONTEXTS` entry — `contexts.test.ts` fails
    otherwise. A `workspace` command calls
    `assertPluginsResolvable(loader, name)` right after `loader.load()`;
    it throws `WorkspaceContextError` (printed cleanly by `cli.ts`'s
    `USER_FACING_ERRORS` catch) only when every provider failed with a
    missing-package error — the global-install case.

## Consuming packages from `theholocron/clients`

When a plugin or the CLI gains a dependency on a `@theholocron/*`
package published from the clients repo:

1. **Add to catalog** in `pnpm-workspace.yaml` under `catalog:`, e.g.:
   ```yaml
   "@theholocron/github-client": ^0.3.2
   ```
2. **Reference via `catalog:`** in the consuming `package.json`
   instead of hardcoding a version.
3. **The `overrides:` block** in `pnpm-workspace.yaml` already forces
   `@theholocron/http-client` to a single version. Any new clients
   package that transitively depends on `http-client` is covered
   automatically — no extra override needed unless the new client
   introduces a different shared dep that could split.

**Why overrides matter:** `@theholocron/github-client` and
`@theholocron/cli` both depend on `@theholocron/http-client`. Without
the override, pnpm can resolve them to different versions, creating two
separate module instances. `instanceof ProviderApiError` then silently
returns `false` — the same class from different instances is never
equal. The `overrides:` block in `pnpm-workspace.yaml` collapses all
resolutions to one version.

**`ProviderApiError.details` is a raw string**, not parsed JSON.
When checking error body content use `String(err.details).includes(...)`,
not object destructuring.

## Code patterns

- **Package manager: pnpm only.** Never use `npm` or `yarn`. Run workspace-wide tasks through Turbo (`pnpm test`, `pnpm build`, etc.); run single-package tasks with `pnpm --filter <name> <script>`.
- **No `any` in TypeScript.** Use `unknown` for values of genuinely unknown shape and narrow with type guards. Use generics instead of `any` in function signatures. `as never` and `as unknown as T` are acceptable for internal casts where the type system can't follow; `any` is not.
- **No third-party observability / telemetry SDK is imported in this repo.**
  `pino`, `@sentry/node`, `posthog-node` live behind
  `@theholocron/observability` — the `Logger` / `ErrorSink` / `AnalyticsSink`
  interfaces (with `Noop*` for the opted-out / no-credentials path) come from
  `@theholocron/observability/core`; the `PinoLogger` / `SentrySink` /
  `PostHogSink` adapters — the sole vendor call sites — from
  `/logger`, `/errors`, `/analytics`. `git grep -nE "@sentry/node|posthog-node|
from \"pino\"" packages/` must return **nothing** (source). The CLI's
  `telemetry.ts` holds only orchestration + `telemetry/resolve.ts` (the
  Holocron-specific DSN / key resolution, which stays here). A vendor swap or a
  test fake is one file — in `theholocron/observability`.
- **Adapter pattern for new vendors.** New plugins use the
  `/holocron-skill-plugin` skill at `.claude/skills/holocron-skill-plugin/`. The
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
  "already exists" / 409 / EPRECONDITION as success, never break
  on re-runs.
- **`holocron.config.json` is the contract.** No hardcoded vendor
  lists, no hardcoded paths, no implicit assumptions. Config drives
  loader; loader drives commands.

## Workflow

- **Discuss → `.notes/<topic>.spec.md` → GitHub issue.** Non-trivial
  decisions get a spec file in `.notes/` before acting. Lifecycle:
  `draft → proposed → accepted → archived` (or `superseded`). Spec name
  prefixes: `tech-` / `tool-` / `process-` / `ci-` / `security-`.
  Once the design is settled the spec **moves to
  `docs/wiki/specifications/`** (`accepted` for living reference docs,
  `archived`/`superseded` for shipped or dropped work); `.notes/` holds
  only in-progress specs. `scripts/validate-adrs.mjs` checks both dirs.
- **File issues for non-trivial work** and reference in commits/PRs
  (`Closes #N` / `Refs #N`). Cross-check against `.notes/*.spec.md`
  before starting; several already have design docs. Skip for typo fixes.

## Quality

- **Definition of done: code + tests + docs + green checks.** A change
  is not done until all four are true:
  1. `holocron ci` passes — it runs exactly the merge-gating checks, in
     CI order, one non-zero exit on the first failure. (Equivalent:
     `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — the same
     set CI runs. Finding failures after pushing wastes a round trip.)
  2. Tests cover the new behavior (new path → new test; bug fix → test
     that would have caught it).
  3. Docs are updated: `packages/cli/README.md` for any public API or
     config shape change; `AGENTS.md` for any architectural or workflow
     change; the relevant `.notes/*.spec.md` spec for any design
     decision or roadmap item resolved. Stale docs that contradict the
     code are bugs.
  4. Commit message follows Conventional Commits and references the
     issue (`Closes #N` / `Refs #N`).
- **Test patterns:** vitest across all packages. Plugins use
  `stubFetch` (REST plugins) or `stubSpawn` (CLI plugins) — both
  ported from rando-id/rando.id `__tests__/helpers.ts`. Per-plugin
  coverage floor: 90%+ lines on the auth + REST/shell + capability
  surface.
- **Don't call `expect(...).toThrow()` twice on the same stubbed call.**
  The stub queue advances per call; second invocation gets the default
  empty response. For multi-property error checks use the `.catch` capture
  pattern instead — it avoids both the double-call and `vitest/no-conditional-expect`:

  ```ts
  // async
  const err = await fn().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(SomeError);
  expect((err as SomeError).message).toMatch(/pattern/);

  // sync
  const err = (() => {
    try {
      fn();
    } catch (e) {
      return e;
    }
  })();
  expect(err).toBeInstanceOf(SomeError);
  ```

- **Discriminated union results** (`{ ok: true; subject } | { ok: false; message }`):
  assert the branch with `expect(result.ok).toBe(true)` then access the
  narrowed field via a cast — never use `if (result.ok)` with `expect`
  inside, as `vitest/no-conditional-expect` correctly flags that:
  ```ts
  expect(result.ok).toBe(true);
  expect((result as { ok: boolean; subject?: string }).subject).toMatch(/pattern/);
  ```
- **`holocron upgrade node` pattern registry.** When you introduce a
  new file type that pins the Node.js version (e.g., a new CI platform's
  config, an `.engines` file, a custom script), add a `Pattern` entry to
  the `PATTERNS` array in
  `packages/cli/src/commands/upgrade-node.ts` — a `matches` predicate
  on the filename and a `patch` function that replaces the old major with
  the new one. The `upgrade.node.extra` field in `holocron.config.json`
  is only for non-conventional _file paths_ (unusual locations for known
  file types); it is not a substitute for adding a new pattern.
- **PR checks must be green before merge.** `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build` all run on `ci.yml`. Run
  `holocron ci` as the local pre-flight (a `pre-push` hook runs it
  automatically in `protection: "strict"` repos; `git push --no-verify`
  bypasses one push). CodeQL runs separately. DCO checks the Signed-off-by
  trailer per commit (use `-s`). Don't merge through red checks.

## Releases (automated)

- **Two release branches.** `main` is the **stable-release branch**
  (publishes to npm's `latest` dist-tag); `alpha` is the
  **prerelease branch** (publishes to the `alpha` dist-tag). All v2
  alpha work happens on `alpha`; merge `alpha → main` only when
  cutting a stable release. A `feat`/`fix`/`refactor`/`perf` landing
  directly on main will publish stable, so keep those PRs targeted at
  `alpha`. Docs, chore, ci, test are safe on either.
- **semantic-release on push to main or alpha.** Walks Conventional
  Commits since the last tag on the branch's channel, computes the
  next version, bumps all 9 public packages in lockstep via
  `scripts/bump-versions.mjs`, publishes via OIDC, creates a GitHub
  Release, commits `CHANGELOG.md`.
- **npm Trusted Publishing.** OIDC token exchange at publish time —
  no `NPM_TOKEN` secret anywhere. Each package has a Trusted
  Publisher registered on npmjs.com (Publisher: GitHub Actions,
  Repo: theholocron/holocron, Workflow: release.yml).
- **First publish for a new package** uses `holocron npm
publish-initial` (chicken-and-egg: trusted publishing needs the
  package to exist first). Workflow: `npm login --auth-type=web`
  → `pnpm install && pnpm build` → `pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp <code>`.

## Repo layout

<!-- prettier-ignore -->
```
packages/
  cli/                            — @theholocron/cli                       (binary + runtime + 14 capability interfaces)
  astromech/                      — @theholocron/astromech                 (task runner: holocron run / ci, thin callers, package scripts, linters, required checks, reusable workflows — ADR-0009, epic #581)
  datapad/                        — @theholocron/datapad                   (generic holocron.config loader — ADR-0010)
  holocron-plugin-github/         — source / ci / secrets / environments / issues
  holocron-plugin-vercel/         — deployment
  holocron-plugin-neon/           — storage
  holocron-plugin-clerk/          — auth (+ parseWebhook utility)
  holocron-plugin-1password/      — vault (CLI shell-out — only non-REST plugin)
  holocron-plugin-doppler/        — vault (REST)
  holocron-plugin-infisical/      — vault (REST)
  holocron-plugin-postman/        — tooling
holocron.config.ts                — this repo's own config (self-hosted)
.notes/                           — in-progress design specs (settled ones move to docs/wiki/specifications/)
.claude/skills/holocron-skill-plugin/ — scaffolding skill for new plugins
.github/workflows/                — ci.yml (PR), release.yml (main), codeql.yml, etc.
scripts/bump-versions.mjs         — lockstep version bump invoked by semantic-release

```

## Backlog

Scheduled-but-not-started work lives on the **[`v4.0` milestone](https://github.com/theholocron/holocron/milestone/3)**
as tracking issues — DO NOT build them speculatively; pick up an issue when
ready. Several have a design doc in `docs/wiki/specifications/` (status
`proposed` there, or `.notes/` while still being drafted) — cross-check
before starting.

In-progress specs (`draft` / `proposed`) sit in `.notes/`; once settled they
move to `docs/wiki/specifications/`. The entire v2-alpha issue backlog
(#74–#96) shipped; the specs that drove it are archived there for reference.
