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
- **Standards (codified in `.claude/skills/holocron-plugin.md`):**
    - `--dry-run` global flag flows through `RuntimeContext.dryRun`;
      commands branch at the orchestrator layer, not in capabilities.
    - `--token` global flag flows through `RuntimeContext.cliToken`;
      plugins' `auth.ts` reads it as first-precedence over env vars.
    - Cross-provider event sync uses normalized `AuthEvent` types in
      core + plugin-exported `parseWebhook(input): AuthEvent` utility
      (NOT a capability method). Swap auth providers without rewriting
      handlers.

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
  "already exists" / 409 / EPRECONDITION as success, never break
  on re-runs.
- **`holocron.config.json` is the contract.** No hardcoded vendor
  lists, no hardcoded paths, no implicit assumptions. Config drives
  loader; loader drives commands.

## Workflow

- **Discuss → `.notes/<topic>.spec.md` → GitHub issue.** Non-trivial
  decisions get a spec file in `.notes/` before acting. Same lifecycle
  as Rando (`draft → proposed → approved → archived`). Spec name
  prefixes: `tech-` / `tool-` / `process-` / `ci-` / `security-`.
- **File issues for non-trivial work** and reference in commits/PRs
  (`Closes #N` / `Refs #N`). Cross-check against `.notes/*.spec.md`
  before starting; several already have design docs. Skip for typo fixes.

## Quality

- **Definition of done: code + tests + docs + green checks.** A change
  is not done until all four are true:
    1. `pnpm typecheck && pnpm lint && pnpm test` pass (same set CI runs
       plus `pnpm build` — finding failures after pushing wastes a round
       trip).
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
  surface. The `cli-utils` package is `private: true` (v1 carryover);
  its typecheck is a no-op.
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
  `pnpm lint`, `pnpm test`, `pnpm build` all run on `ci.yml`. CodeQL
  runs separately. DCO checks the Signed-off-by trailer per commit
  (use `-s`). Don't merge through red checks.

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
  next version, bumps all 7 public packages in lockstep via
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
build them speculatively; pick up the issue when ready. Cross-check
against `.notes/*.spec.md` before starting; several already have
design docs.

- **#76** Per-plugin `transport: 'rest' | 'cli'` option. Still
  grounded: 1P plugin is the reference CLI-transport case
  (see #96 — plugin stays published even though this repo doesn't
  use it as default).
- **#77** `holocron plugin create` CLI command (promote the
  scaffolding skill to a first-class CLI feature) — spec at
  `.notes/tool-plugin-create.spec.md` (Phase 1 unblocked).
- **#78** CLI-transport sibling skill — still motivated (same
  reason as #76).
- **#79** Multi-plugin `--token` disambiguation
- **#80** Real Svix HMAC verification in `parseWebhook`
- **#82** Extend `holocron setup` with repo policy + branch
  protection — spec at `.notes/tech-setup-and-config.spec.md`
  (also covers `project.repo` config field + capability-factory
  lazy-load pattern discovered during v2 alpha migration).

Additional session-derived design docs (not on GitHub yet — file
issues when the work is scheduled):

- `.notes/tech-auth-bootstrap.spec.md` — keyring-backed bootstrap
  credentials + `holocron auth` subcommand. Foundation shipped in
  PR #94; ongoing pattern for future plugins.
- `.notes/tech-vault-choice.spec.md` — Doppler + Infisical adoption,
  1P deprecation roadmap.
