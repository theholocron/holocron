---
status: accepted
issue: theholocron/holocron#676
blocked-by:
  - theholocron/holocron#675
related:
  - theholocron/holocron#672
  - theholocron/holocron#680
---

# Config resolution — zero committed tool-config files (three-bucket)

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers D7 and the "Config
resolution" section of that spec in full detail.

## Problem

Today `astromech`'s `TASKS` registry runs `eslint .`, `vitest run`, `tsdown`
with no `--config` flag — each tool auto-discovers a same-named file the
repo commits, which is exactly the residual duplication the epic exists to
close (every repo needs _some_ local file, even a thin one, for the tool to
find). Not just cross-repo duplication either — `theholocron/clients` alone
has 13 vendor packages, each carrying its own `eslint.config.ts` /
`tsconfig.json` / `tsdown.config.ts` / `vitest.config.ts`: 52 files in one
repo.

This doesn't apply uniformly to every tool config in a repo, though — three
genuinely different categories, verified against each tool's actual CLI
rather than assumed.

## Bucket A — zero committed file

The tool is invoked by our own CLI and accepts an explicit external config
path. Verified today: `eslint --config`, `prettier --config`, `vitest
--config` (`-c`), `tsdown --config`, `knip --config` (`-c`), `commitlint
--config` (`-g`), `semantic-release --extends` (`-e`), `devmoji --config`
(`-c`), `editorconfig-checker --config` (both newly verified — see below).
The target:

```
eslint --config <resolved path> .
prettier --config <resolved path> --check .
vitest run --config <resolved path>
tsdown --config <resolved path>
knip --config <resolved path>
commitlint --config <resolved path>
semantic-release --extends <resolved path>
devmoji --config <resolved path>
editorconfig-checker --config <resolved path>
```

No local `eslint.config.ts`, `prettier.config.*`, `vitest.config.ts`,
`tsdown.config.ts`, `knip.config.ts`, `commitlint.config.ts`,
`release.config.ts`, `devmoji.config.cjs`, or `.editorconfig-checker.json`
needed — the tool never looks for one because it's handed the path
directly.

Requires `astromech`'s task registry resolving the shared-package path
(from the repo's `@theholocron/*-config` catalog version) and passing
`--config`/`--extends` when invoking each tool. Removing the now-redundant
pointer files from every repo folds into the migration-pass workstream,
#680, not duplicated here.

### Not all seven tools are equally ready — verified against every migrated repo

Checked the actual committed `eslint.config.ts` / `commitlint.config.ts` /
`release.config.ts` in `holocron`, `clients`, `utils`, `configs`, and
`themes`. Three tools are genuinely zero-value pointers today — safe to go
Bucket A immediately, no shared-package changes needed:

- **`prettier.config.ts`** — pure re-export in every repo checked.
- **`tsdown.config.ts`** — pure re-export (`export { default } from
"@theholocron/tsdown-config/presets/<variant>"`) in every repo checked.
- **`knip.config.ts`** — repo-specific (entry points, ignored deps) by
  nature, not a shared-config candidate at all — already excluded from
  Bucket A implicitly, noting it here for completeness.

Two tools' local files carry real, load-bearing per-repo content today —
pointing `--config` straight at the raw shared-package file would silently
**drop** that content, not just remove duplication:

- **`eslint.config.ts`** — every repo has repo-specific `ignores:` (dist/
  coverage paths vary by monorepo layout), and most have repo-specific rule
  overrides (a `docs/src` → `n/no-extraneous-import: off` exception shows up
  in 4 of 5 repos checked; `utils` disables a rule only for its
  browser-targeted packages; `themes` sets `tsconfigRootDir`).
- **`release.config.ts`** — every repo has a genuinely different
  `exec.publishCmd`/`prepareCmd`: single-package vs. monorepo `--filter`,
  provenance on/off, `configs`' own hand-rolled shell loop that skips
  already-published versions (it ships many small, independently-versioned
  packages that don't all bump every release).

The fix isn't a runtime merge mechanism (repo delta + shared base combined
at invocation time) — it's the same move `@theholocron/eslint-config`
already makes for `n/hashbang`/`n/no-unpublished-import` in `library()`
today: **absorb the pattern into the shared package**, either as universal
built-in behavior or as a preset parameter fed from data `holocron.config.ts`
/ `pnpm-workspace.yaml` already expose. Concretely:

- **`eslint-config`**:
  1. Ignore via `.gitignore`, not a hand-maintained `ignores:` array — every
     repo's `.gitignore` already excludes `dist/`, `coverage/`,
     `node_modules/`; ESLint's flat config can load ignore patterns from it
     directly (`@eslint/compat`'s `includeIgnoreFile()` or equivalent) —
     removes the per-repo array entirely, and it can never drift from what
     git itself already ignores.
  2. Bake the `docs/src` exception into `library()` (or wherever it
     belongs) unconditionally, scoped to a `docs/src/**` glob — a no-op for
     any repo without that directory, so it's safe to always include rather
     than opt into.
  3. The genuinely repo-specific remainder — done in `configs`#461:
     `library()` now bakes in `vitest()` unconditionally (glob-scoped to
     test/setup files, a no-op anywhere it doesn't match, same reasoning
     as `docsSrcConfig` — this also fixes a doc/code mismatch, the README
     already described `library()` as including `vitest()` when the code
     didn't yet) and takes an optional `browserPackages` parameter for
     `utils`' one real outlier. `themes`' `tsconfigRootDir` override and
     `holocron`'s `settings.node` version override turned out to be
     redundant with the shared package's own defaults
     (`typescript-eslint` already defaults `tsconfigRootDir` to
     `process.cwd()`; `eslint-plugin-n`'s `node()` already reads
     `engines.node` from the consuming repo's `package.json`) — no new
     parameter needed for either; worth just dropping both overrides at
     #680's migration pass.

     `browserPackages` is real per-repo _data_, though, which a bare
     `eslint --config <resolved path>` flag can't carry (no way to pass
     JS-level options through a CLI flag pointing at a static file) — the
     resolver (next PR-stack item) needs to special-case this: `utils`
     keeps a tiny `eslint.config.ts` (`export default
library({ browserPackages: [...] })`) rather than reaching zero
     committed file, same as any Bucket C content. Every other repo
     resolves straight to `library()`'s built dist file with no local
     file needed at all.
- **`release.config.ts`'s `exec.publishCmd`**: the `prepareCmd` half of
  this already goes through the CLI (`holocron bump-versions` — just fixed
  a live bug where 4 repos called a stale `holocron npm bump-versions` that
  no longer exists, theholocron/holocron#696). `publishCmd` should get the
  same treatment rather than adding monorepo-awareness to
  `semantic-release-config`'s JS-level `defineConfig()` options — keeps all
  the logic in one place (the CLI) instead of splitting it across `configs`
  and `holocron`.

  `packages/cli/src/commands/publish.ts`'s `runPublish()` (today:
  `holocron publish --initial`, the one-shot Trusted Publisher bootstrap)
  already has exactly the monorepo-detection + `pnpm publish` invocation
  logic a steady-state `publishCmd` needs — `hasPackagesDir()` picks
  `-r --filter=./packages/*` vs. a bare root publish, building the same
  `publishArgs` either way. Extend it to a non-`--initial`, steady-state
  mode (the doc comment already reserves the flag surface for this:
  "`--initial` is required today... exists so the surface doesn't need
  another rename when it is built") rather than writing new
  monorepo-detection logic a second time:

  - Skip the `npm whoami`/`npm login --auth-type=web` dance and the
    Trusted-Publisher "next steps" printout — both bootstrap-only. CI's
    steady-state publish authenticates via OIDC automatically, no
    interactive login involved.
  - Default `--provenance` on (currently inconsistent — present in
    `utils`/`themes`/`observability`'s hand-typed `publishCmd`, absent from
    `clients`'s).
  - Add a `skipAlreadyPublished` option: check `npm view <pkg>@<version>`
    before publishing each package, skip if it already exists. Replaces
    `configs`' hand-rolled shell loop (many small, independently-versioned
    packages that don't all bump every release) with a CLI flag instead of
    bespoke shell.

  Once this exists, `exec.publishCmd` becomes `pnpm exec holocron publish`
  (plus `--skip-already-published` for `configs`) uniformly — no
  per-repo shell, matching `prepareCmd`'s existing uniformity.

- **`commitlint-config`**: already the closest to done — the shared
  package's `index.ts` already carries real logic (a dependabot-commit
  `ignores` regex, `body-max-line-length` disabled) that every repo
  currently gets via a pure `{ extends: [...] }` pointer, **except**
  `holocron` itself, which adds `footer-max-line-length: [0]` locally. Given
  every repo's commits carry a `Signed-off-by:` trailer (`-s` is the
  session-wide convention — see `AGENTS.md`), that's a universal need, not
  a `holocron`-specific one — fold it into the shared package rather than
  leaving it as a one-repo local override. (Also noticed: `extends:
["@theholocron"]` vs. `extends: ["@theholocron/commitlint-config"]` differ
  in string form across repos — worth confirming these actually resolve
  identically and normalizing to one form, low-stakes either way.)

Once `eslint-config`/`commitlint-config` (both in `configs`) and the
`holocron publish` extension (in `holocron` itself) land, all seven tools
are uniformly Bucket A — no per-repo delta, no runtime merge step, just
`--config <resolved shared path>` (or, for `release.config.ts`, a uniform
`pnpm exec holocron publish` invocation).

### Previously unverified, now confirmed

- **`devmoji`**: `devmoji --help` confirms `-c|--config <file>` — Bucket A,
  same as everything else. No blocker.
- **`.editorconfig-checker.json`** (the linter's own settings, not
  `.editorconfig` itself): `editorconfig-checker --help` confirms `-config
string` — Bucket A, not Bucket B as originally guessed. `.editorconfig`
  itself (the file editors read directly) stays Bucket B, unaffected.

## Bucket B — must stay committed, but generated, never hand-authored

A _different_ consumer discovers the file directly from the filesystem or
repo, with no CLI flag our own tooling could hand a path through even if it
wanted to:

- **`tsconfig.json`** (D7) — IDE / TypeScript-language-server project
  discovery, no override mechanism. Stays a thin
  `{ "extends": "@theholocron/tsconfig/<variant>.json" }` pointer, nothing
  else.
- **`.editorconfig`** — editors read this directly as you type; the
  EditorConfig spec has no `extends`/external-pointer concept at all, so
  there's no flag to offer even in principle.
- **`codecov.yml`** — Codecov's own servers read this directly from the repo
  via GitHub's integration when processing an uploaded coverage report;
  never invoked by anything our CLI runs. Already precedented —
  `astromech.codecovConfig()` already generates this file today.
- **`.alexrc.json`** — already "Generated by `holocron setup` — do not edit
  manually" per this org's own `AGENTS.md`. Already following this pattern.

## Bucket C — genuinely repo-specific content, not a duplicated ruleset

`astro.config.ts` for a docs-site repo: the `defineConfig` wrapper and
`docsTheme`/`starlight` imports are already centralized
(`@theholocron/astro-config`), but the sidebar navigation, package list, and
`srcDir`/`outDir` paths passed into it are real per-repo data — the same
situation `holocron.config.ts` itself is always in. Nothing to centralize
away here; not a gap this workstream closes.

## Scope

- **`theholocron/configs` changes (prerequisite for eslint to reach Bucket
  A)**:
  - `eslint-config`: `.gitignore`-based ignoring, bake in the `docs/src`
    exception, parameterize the remaining genuinely repo-specific bits
    (browser-package list, `tsconfigRootDir`) as bundle options.
  - `commitlint-config`: fold `footer-max-line-length: [0]` in (universal
    need, not `holocron`-specific); normalize the `extends:` string form.
- **`holocron` changes**:
  - Extend `packages/cli/src/commands/publish.ts`'s `runPublish()` to a
    non-`--initial`, steady-state mode: skip the bootstrap login/next-steps
    flow, default `--provenance` on, add `skipAlreadyPublished`. Reuses the
    existing `hasPackagesDir()`/`publishArgs` monorepo-detection logic
    rather than duplicating it in `semantic-release-config`.
  - `astromech`/CLI resolver logic — given a repo's `holocron.config.ts` +
    `@theholocron/*-config` catalog versions, resolve the absolute path to
    each Bucket A tool's shared config and pass `--config`/`--extends`/`-c`
    — wired into `holocron run <task>`.
  - Bucket B generator functions (parallel to `astromech.codecovConfig()`)
    for `tsconfig.json`, `.editorconfig`.

## Out of scope

- The vocabulary/registry rename itself (#675), though both touch the same
  registry entries.
- Bucket C content — left as-is, not touched.
- Actually removing the redundant files from existing repos — that's the
  migration pass, #680.

## PR-stack

- [x] `configs`: eslint-config gitignore-based ignoring + baked-in
      `docs/src` exception + bundle parameters for the remaining
      repo-specific bits (`configs`#460)
- [x] `configs`: commitlint-config fold in `footer-max-line-length`,
      normalize `extends:` form (`configs`#459)
- [x] `holocron`: extend `runPublish()` to a steady-state (non-`--initial`)
      mode — `skipAlreadyPublished`, `--provenance` default, no bootstrap
      login/next-steps flow (`holocron`#697)
- [x] `holocron`: resolver logic wired into `holocron run <task>` — done for
      five tools (`eslint`, `prettier`, `vitest`, `tsdown`, `commitlint`),
      each verified end-to-end against a real fixture through the actually
      compiled CLI binary, not just source-level unit tests. `configs`#462/
      #463 gave `eslint`/`devmoji` the ready-to-use default export
      `--config`/loading needs (a gap #461 didn't close — `library()` had
      only a named export, and ESLint's `--config` loader requires the
      file's _default_ export; caught with a minimal repro before shipping,
      not assumed). Deliberately unwired: `semantic-release` (`defineConfig()`
      needs real per-repo data — branches, npm options — a static
      `--extends <path>` can't carry; a genuinely separate design question,
      not a resolver gap), `devmoji` (runs through a git hook template, not
      `holocron run <task>`, even though the package itself is now ready),
      `editorconfig-checker` (no shared-config package exists yet), `knip`
      (repo-specific by nature, never a shared-config candidate).
- [x] `holocron`: Bucket B generators — `.editorconfig` already had one
      (`packages/cli/src/templates/configs/editorconfig/`, pre-dating this
      workstream); added `tsconfig.json`'s (`astromech.createTsconfig()`).
      Surveyed 20+ package-level `tsconfig.json` files across `holocron`/
      `clients`/`utils`: `extends`, `compilerOptions.baseUrl`/`outDir`,
      `include`, `exclude` are uniform everywhere — safe defaults; `paths`
      (a `@/*` alias) is a real per-package choice (~40% of packages) —
      an opt-in parameter. `module`/`moduleResolution` (only the CLI
      package overrides these, deliberately, away from the shared preset's
      `nodenext`/`nodenext`) and `rootDir` (present in two packages, always
      redundant with `include`) checked and left out of the defaults —
      genuine per-package deviations, not a pattern to generalize (same
      category as eslint's `tsconfigRootDir`/`settings.node` turning out
      redundant, `configs`#461). Monorepo-_root_ `tsconfig.json` (a TS
      project-references solution file, structurally different and
      genuinely per-repo) is out of scope, same as Bucket C content.
      Not yet wired into `holocron setup`'s write loop — every other
      Bucket B file there is a single repo-root file, safely overwritten
      every run; `tsconfig.json` is per-package, and most packages' files
      still carry real hand-authored content today (not yet migrated to a
      fully generated state). That per-package iteration + safe-migration
      design is #680's job — this PR ships the generator itself, ready
      for it to call.

- [x] Tests + docs across all of the above
