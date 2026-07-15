---
status: proposed # draft → proposed (issue filed) → approved (milestone attached) → archived
issue: 77
blocked-by: []
---

<!-- editorconfig-checker-disable-file -->

# `holocron plugin create <slug> <vendor>`

> **Phased.** Phase 1 (REST-only) **shipped** on `alpha` — 17
> templates, subcommand wired, orchestrator + preflight + slug
> collision + capability validation + generate + print-next-steps.
> The skill file is a stub pointing at the CLI.
>
> **Prompts + verify are follow-ups** (see §Roadmap). The command
> currently errors clearly when `--capability` / `--vendor-env` /
> `--base-url` are missing; interactive prompts + post-scaffold
> `pnpm install + typecheck + lint + test` are next.
>
> **Phase 2 (`--transport cli` variant) is CANCELLED** as of
> 2026-07-06 — its two prerequisites (#76 per-plugin `transport`
> option, #78 CLI-transport sibling skill) both closed as won't-fix.
> 1P remains the sole CLI-transport plugin and no additional
> CLI-transport plugins are planned. If that ever changes,
> hand-modify from 1P as the reference and file a fresh focused
> issue rather than reviving Phase 2 here. Phase 3 (`--from-rando`)
> remains a nice-to-have.

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
  regular shell — and it's what a _downstream_ project reaches for
  when they need to author their own vendor plugin.
- The scaffolding logic is already codified in the skill; it just
  needs to be re-hosted as TS code invoked through the existing
  yargs subcommand plumbing.
- The 3 plugins built with the skill (Clerk, 1Password, Postman)
  have surfaced the template well — enough signal to bake it into
  code without over-fitting to any one plugin.

## Command shape

<!-- prettier-ignore -->
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
    # --transport was planned but CANCELLED (see §Roadmap Phase 2).
    # REST-only scaffolding covers every plugin now on the roster.
    [--dry-run]                  # print the file list, write nothing
    [--no-verify]                # skip post-scaffold pnpm install/typecheck/lint/test
<!-- prettier-ignore -->
```

Positional args (`slug`, `vendor`) are required — everything else has
a sensible default or prompts. This is symmetric with existing
orchestrator commands (`holocron setup`, `holocron secrets sync`)
which also mix positional + interactive prompts.

## Behavior — happy path

Legend: ✅ shipped in Phase 1a · ⏳ Phase 1b follow-up.

1. **Preflight** ✅ — verify CWD is a holocron workspace root
   (`pnpm-workspace.yaml` + `packages/` dir present). If not, error
   with a clear message.
2. **Slug collision** ✅ — `packages/holocron-plugin-<slug>/` must
   not exist. If it does, error "already exists — edit in place or
   pick a different slug".
3. **Prompt for anything missing** ⏳ — capability key, vendor-native
   env, base URL — using `@theholocron/cli-utils` prompts. Today the
   command errors clearly if these flags are absent; interactive
   prompts land in Phase 1b.
4. **Capability sanity** ✅ — capability key must be one of the 14
   in `CARDINALITY`; error if not. Prints a many-cardinality
   warning (not a hard confirm; a confirmation gate is Phase 1b).
5. **Generate** ✅ — write the 17 template files to
   `packages/holocron-plugin-<slug>/` (see §Templates below).
6. **Verify** ⏳ — (unless `--no-verify`) run `pnpm install && pnpm
--filter <pkg> typecheck lint test`. Flag exists in yargs
   already; the actual pnpm invocation lands in Phase 1b.
7. **Print next steps** ✅ — 7-step operator checklist including
   pnpm install, typecheck/lint/test, implement methods, replace
   `it.todo`, commit.

`--dry-run` skips steps 5–7 and prints the file list only.

## Templates

Template content lives **inline as TS string builders** in
`packages/cli/src/commands/plugin-create/templates/`. The as-shipped
list is **17 files** (not 14 as the original spec estimated —
`verify-token.ts` / `verify-token.test.ts` / `tsdown.config.ts` were
added post-#94 to reflect the session-derived plugin conventions):

**Config (5)**

- `package-json.ts` → returns the `package.json` string
- `tsconfig-json.ts` → returns the `tsconfig.json` string
- `vitest-config.ts` → `vitest.config.ts`
- `eslint-config.ts` → `eslint.config.js`
- `tsdown-config.ts` → `tsdown.config.ts` (new since draft)

**Docs (1)**

- `readme.ts` → `README.md`

**Source (5)**

- `auth.ts` → `src/auth.ts` (4-step keyring precedence)
- `rest.ts` → `src/rest.ts`
- `verify-token.ts` → `src/verify-token.ts` (new since draft)
- `plugin-index.ts` → `src/index.ts` (includes `AUTH_HINT` +
  `verifyToken` re-exports)
- `capability.ts` → `src/capabilities/<key>.ts` (stubbed body — no
  `implements` at scaffold time; operator adds it once methods land)

**Tests (6)**

- `helpers.ts` → `src/__tests__/helpers.ts` (stubFetch)
- `auth-test.ts` → `src/__tests__/auth.test.ts`
- `rest-test.ts` → `src/__tests__/rest.test.ts`
- `verify-token-test.ts` → `src/__tests__/verify-token.test.ts` (new)
- `capability-test.ts` → `src/__tests__/<key>.test.ts` (it.todo)
- `index-test.ts` → `src/__tests__/index.test.ts`

Inline TS over file-based `.tmpl` templates because:

- No template engine dep
- Templates get typechecked against a shared `TemplateInputs` type
- Editor jumps to the string source directly
- Small enough surface (17 files, ~1000 LOC of templates) that it
  doesn't overwhelm the codebase

Each template exports `(inputs: TemplateInputs) => string` and takes
the same input record. The original design anticipated a tagged
discriminated union for REST/CLI-transport variants; with Phase 2
cancelled, `TemplateInputs.transport` is effectively a constant `"rest"`
and can be removed in a future cleanup pass.

### `TemplateInputs`

<!-- prettier-ignore -->
```ts
interface TemplateInputs {
  slug: string; // 'clerk'
  vendorName: string; // 'Clerk' (PascalCase)
  vendorUpper: string; // 'CLERK'
  capability: CapabilityKey; // 'auth'
  capabilityClass: string; // 'ClerkAuth'
  tokenEnv: string; // 'HOLOCRON_CLERK_TOKEN'
  vendorEnv: string; // 'CLERK_SECRET_KEY'
  baseUrl: string; // 'https://api.clerk.com/v1'
  transport: "rest"; // constant — 'cli' variant cancelled (Phase 2 CANCELLED)
}
<!-- prettier-ignore -->
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
>
> ```
> holocron plugin create <slug> <vendor>
> ```
>
> The skill file itself is deprecated — kept only so old references
> resolve.

## Test plan

**Shipped (Phase 1a)**:

- **Unit** — `packages/cli/src/__tests__/plugin-create.test.ts`
  covers the orchestrator surface: file count (17), path
  substitution (`{{capability}}` → real key), dry-run vs write,
  preflight failure, slug collision, unknown capability rejection,
  many-cardinality warning, and rendered-content sanity checks on
  package.json / auth.ts / index.ts.
- **Manual end-to-end** — during development, scaffolded a
  `testvendor` plugin with `--capability tooling`, ran
  `pnpm --filter @theholocron/holocron-plugin-testvendor typecheck
lint test` — all green. The command's output matches expectations.

**Follow-up (Phase 1b)**:

- **Golden-file tests per template** — the original spec called for
  17 individual goldens. Shipped as inline rendered-content
  assertions instead (fewer files, similar coverage). Full goldens
  would be additive; not urgent.
- **Automated integration test** — vitest scenario that spawns
  `holocron plugin create` against a temp workspace fixture, runs
  the generated package's `pnpm install && typecheck lint test`,
  cleans up. Skip on CI initially per the original spec (pnpm
  install is slow); gate behind `RUN_PLUGIN_CREATE_E2E=1`.

## Roadmap

- **Phase 1a** (shipped): `holocron plugin create <slug> <vendor>`
  REST-only. 17 templates, subcommand, preflight, slug collision
  check, capability validation, `--dry-run`, generate loop with
  `{{capability}}` path substitution, print-next-steps. Skill file
  reduced to a stub.
- **Phase 1b** (follow-up — same issue #77): Interactive prompts
  for missing `--capability` / `--vendor-env` / `--base-url`.
  Post-scaffold verify step (`pnpm install && pnpm --filter <pkg>
typecheck lint test`) gated by `--no-verify`. Full integration
  test (behind an env flag — spawns pnpm install and typechecks
  the generated package end-to-end).
- **Phase 2** (**CANCELLED** 2026-07-06): originally to add a
  `--transport cli` variant. Both prerequisites (#76 per-plugin
  transport option, #78 CLI-transport sibling skill) were closed as
  won't-fix. 1P stays as the sole CLI-transport plugin; if another
  ever surfaces, hand-modify from 1P as the reference and open a
  fresh focused issue rather than reopening this phase.
- **Phase 3** (later): Add `--from-rando <path>` flag that reads an
  existing Rando adapter and pre-fills the template — turns the
  Rando-porting checklist at the bottom of the (now-stub) skill
  into a machine step.

## Open questions

1. **Should `--dry-run` also show file _contents_, gated behind
   `-v`?** Argument for: operator can review before writing. Argument
   against: prints ~800 lines to the terminal.
2. **Should there be a `holocron plugin list` complement?** Trivial
   to add (reads `packages/`, filters for `holocron-plugin-*`) but
   maybe out of scope until someone asks.
3. **Naming: `plugin create` vs `plugin new` vs `create-plugin`?**
   Sketch says `plugin create` (subcommand form, matches
   `holocron secret set`). Sticking with that unless there's a
   reason not to.
