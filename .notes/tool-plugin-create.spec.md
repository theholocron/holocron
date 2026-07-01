---
status: draft # draft → proposed (issue filed) → approved (milestone attached) → archived
issue: 77
blocked-by: [76, 78]
---

<!-- editorconfig-checker-disable-file -->

# `holocron plugin create <slug> <vendor>`

> **Blocked.** Design deferred until #76 (per-plugin `transport`
> option) and #78 (CLI-transport sibling skill) land. Reason: the
> template shape depends on how transport variants are declared in
> `holocron.config.json` and what the CLI-transport plugin structure
> looks like. Designing REST-only templates first would likely bake
> in the wrong abstractions and force a rewrite once the other two
> land. Revisit this spec after both are merged.

## Decision

Promote the `holocron-plugin` Claude Code skill (at
`.claude/skills/holocron-plugin.md`) into a first-class CLI command
under `@theholocron/cli`. Same template, same verification, same
non-negotiables — invocable from a plain terminal, no Claude in the
loop.

Once the CLI ships, the skill file becomes a **stub** that points
operators at `holocron plugin create`. Two implementations of the
same template drift; we consolidate on the CLI.

## Why

- Issue #77 makes the case: the skill is fine for AI-assisted
  scaffolding, but the CLI is what an operator reaches for from a
  regular shell — and it's what a *downstream* project reaches for
  when they need to author their own vendor plugin.
- The scaffolding logic is already codified in the skill; it just
  needs to be re-hosted as TS code invoked through the existing
  yargs subcommand plumbing.
- The 3 plugins built with the skill (Clerk, 1Password, Postman)
  have surfaced the template well — enough signal to bake it into
  code without over-fitting to any one plugin.

## Command shape

```bash
holocron plugin create <slug> <vendor>
    [--capability <key>]         # source|ci|secrets|environments|issues|
                                 # deployment|storage|auth|vault|dns|
                                 # tooling|notifications|analytics|
                                 # observability
                                 # (interactive prompt if omitted)
    [--token-env <ENV>]          # holocron env var name
                                 # (default: HOLOCRON_<VENDOR_UPPER>_TOKEN)
    [--vendor-env <ENV>]         # vendor-native env var name
                                 # (interactive prompt if omitted)
    [--base-url <URL>]           # REST base URL
                                 # (interactive prompt if omitted)
    [--transport <rest|cli>]     # default: rest
                                 # cli transport blocked pending #78
    [--dry-run]                  # print the file list, write nothing
    [--no-verify]                # skip post-scaffold pnpm install/typecheck/lint/test
```

Positional args (`slug`, `vendor`) are required — everything else has
a sensible default or prompts. This is symmetric with existing
orchestrator commands (`holocron setup`, `holocron secrets sync`)
which also mix positional + interactive prompts.

## Behavior — happy path

1. **Preflight**: verify CWD is a holocron workspace root
   (`pnpm-workspace.yaml` + `packages/` dir present). If not, error
   with the same message pnpm gives on out-of-workspace runs.
2. **Slug collision**: `packages/holocron-plugin-<slug>/` must not
   exist. If it does, error "already scaffolded, edit in place".
3. **Prompt for anything missing**: capability key, vendor-native env,
   base URL — using `@theholocron/cli-utils` prompts.
4. **Capability sanity**: capability key must be one of the 14; error
   if not. If capability cardinality is `many` (per `CARDINALITY` in
   `capabilities/index.ts`), print a warning + confirm — those need
   different wiring in `holocron.config.json`.
5. **Generate**: write the 14 template files to
   `packages/holocron-plugin-<slug>/` (see §Templates below).
6. **Verify** (unless `--no-verify`): run
   `pnpm install && pnpm --filter <pkg> typecheck lint test`. If any
   step fails, surface verbatim and leave the scaffold in place — the
   operator can inspect + delete if they choose.
7. **Print next steps**: implement the capability methods, replace
   `it.todo`, update README, commit.

`--dry-run` skips steps 5–7 and prints the file list only.

## Templates

Template content lives **inline as TS string builders** in
`packages/cli/src/commands/plugin-create/templates/`:

- `package-json.ts` → returns the `package.json` string given inputs
- `tsconfig-json.ts` → returns the `tsconfig.json` string
- `vitest-config.ts` → `vitest.config.ts` string
- `eslint-config.ts` → `eslint.config.js` string
- `readme.ts` → `README.md` string
- `auth.ts` → `src/auth.ts` string
- `rest.ts` → `src/rest.ts` string
- `plugin-index.ts` → `src/index.ts` string
- `capability.ts` → `src/capabilities/<key>.ts` string (stubbed body)
- `helpers.ts` → `src/__tests__/helpers.ts` string (stubFetch)
- `auth-test.ts` → `src/__tests__/auth.test.ts` string
- `rest-test.ts` → `src/__tests__/rest.test.ts` string
- `capability-test.ts` → `src/__tests__/<key>.test.ts` string (it.todo)
- `index-test.ts` → `src/__tests__/index.test.ts` string

Inline TS over file-based `.tmpl` templates because:
- No template engine dep
- Templates get typechecked against a shared `TemplateInputs` type
- Editor jumps to the string source directly
- Small enough surface (14 files, ~800 LOC of templates) that it
  doesn't overwhelm the codebase

Each template exports `(inputs: TemplateInputs) => string` and takes
the same input record — a tagged discriminated union for
REST/CLI-transport variants (CLI-transport variant deferred to #78).

### `TemplateInputs`

```ts
interface TemplateInputs {
    slug: string;                       // 'clerk'
    vendorName: string;                 // 'Clerk' (PascalCase)
    vendorUpper: string;                // 'CLERK'
    capability: CapabilityKey;          // 'auth'
    capabilityClass: string;            // 'ClerkAuth'
    tokenEnv: string;                   // 'HOLOCRON_CLERK_TOKEN'
    vendorEnv: string;                  // 'CLERK_SECRET_KEY'
    baseUrl: string;                    // 'https://api.clerk.com/v1'
    transport: "rest";                  // 'cli' variant pending #78
}
```

## Non-negotiables (mirrored from the skill)

These are hard invariants the templates encode:

- Auth precedence: `--token` → `HOLOCRON_<X>` → `<vendor-native>`.
  Throw `AuthError` with a message naming both env vars.
- REST wraps transport failures (`TypeError: fetch failed`) into
  `ProviderApiError` with `status: 0`. Path in the message.
- 204 handling: `request<T>` returns `undefined` on 204 OR when
  `expectNoContent: true`.
- Tests use `stubFetch` (verbatim from
  `packages/holocron-plugin-neon/src/__tests__/helpers.ts`).
- Workspace + catalog deps for the standard dev-deps.
- `@theholocron/cli` is peer dep + devDep at `workspace:*`.
- Underscore-prefix unused params (workspace ESLint has
  `^_` in argsIgnorePattern / varsIgnorePattern).
- Never `expect(...).toThrow()` twice on the same stubbed call —
  the templates emit `try/catch + property assertions` instead.

If any of these change in the future, they change in one place (the
template modules) and every new plugin picks it up.

## Skill deprecation

Once the CLI ships and there's a green e2e test that scaffolds a
throwaway plugin, `.claude/skills/holocron-plugin.md` becomes a
~10-line stub:

> The scaffolding logic lives in `holocron plugin create`.
> Run it directly:
> ```
> holocron plugin create <slug> <vendor>
> ```
> The skill file itself is deprecated — kept only so old references
> resolve.

## Test plan

- **Unit**: each template module gets a golden-file test — input
  record → expected string. Add a template, add a golden.
- **Integration**: single vitest scenario that spawns
  `holocron plugin create test-plugin TestVendor` in a temp workspace
  fixture (with the minimum viable `pnpm-workspace.yaml` +
  `holocron.config.json`), asserts:
  1. The 14 files exist and their content matches golden output
  2. `pnpm --filter @theholocron/holocron-plugin-test-plugin typecheck`
     passes on the scaffolded package
- **Skipped on CI initially**: the integration test runs `pnpm install`
  which is slow — mark it `describe.skip` behind an env flag, run
  locally + as a periodic job. Similar to Rando's Postgres opt-in
  tests.

## Roadmap

- **Phase 1** (this issue): Ship `holocron plugin create <slug> <vendor>`
  REST-only. Templates + prompts + verify.
- **Phase 2** (needs #76+#78): Add `--transport cli` variant. Requires
  the `transport` option in `holocron.config.json` (#76) and the
  CLI-transport skill/design (#78).
- **Phase 3** (later): Add `--from-rando <path>` flag that reads an
  existing Rando adapter and pre-fills the template — turns the
  Rando-porting checklist at the bottom of the skill into a machine
  step.

## Open questions

1. **Should `--dry-run` also show file *contents*, gated behind
   `-v`?** Argument for: operator can review before writing. Argument
   against: prints ~800 lines to the terminal.
2. **Should there be a `holocron plugin list` complement?** Trivial
   to add (reads `packages/`, filters for `holocron-plugin-*`) but
   maybe out of scope until someone asks.
3. **Naming: `plugin create` vs `plugin new` vs `create-plugin`?**
   Sketch says `plugin create` (subcommand form, matches
   `holocron secret set`). Sticking with that unless there's a
   reason not to.
