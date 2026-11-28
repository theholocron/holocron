---
id: SPEC-0042
status: archived
issue: theholocron/holocron#992
blocked-by: []
related: []
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618740521435176
---

# Move `holocron-plugin-*` packages to a top-level `plugins/` directory

`packages/` currently holds 21 workspace packages flat: 5 core-infra
packages (`cli`, `astromech`, `datapad`, `sentinel`,
`rollup-plugin-transform-template`) and 16 `holocron-plugin-*` vendor
packages. As more vendors are added the flat listing gets difficult to scan.
Moving the 16 plugin packages to their own top-level `plugins/` directory
(sibling to `packages/`) keeps `packages/` to the core packages and gives
"plugin" its own first-class location — matching what the package name
already says (`holocron-plugin-<vendor>`), without the redundant
`packages/plugins/holocron-plugin-<vendor>` triple-nesting a nested option
would produce.

## Why this is viable: package discovery already supports multiple roots

`@theholocron/astromech`'s `readWorkspacePackages()` (used by `holocron
repo setup`'s codecov-component generation and by the CLI's derived
custom-properties sync) already scans `packages/*` **and** `apps/*` as
independent, optional top-level roots — a repo without an `apps/` directory
gets `[]` for it. Adding `plugins/*` as a third root is the same
pattern, not a new one. Everywhere else, discovery is one level deep under
a single hardcoded `"packages"` string — those need updating, not
redesigning.

## Full scope

### A. Directory moves (`git mv`, preserves history)

All 16: `holocron-plugin-{1password,axiom,clerk,cloudflare,discord,doppler,
fern,github,infisical,neon,netlify,posthog,postman,sentry,slack,vercel}`
→ `plugins/holocron-plugin-<name>`. `cli`, `astromech`, `datapad`,
`sentinel` stay in `packages/`. (`rollup-plugin-transform-template` has since moved
out of this repo to `theholocron/configs` under `plugins/`.)

### B. Workspace / tooling config

- `pnpm-workspace.yaml` — add `"plugins/*"` to the `packages:` glob list.
- `knip.config.ts` — rename the `"packages/holocron-plugin-*"` workspace
  key to `"plugins/holocron-plugin-*"`.
- `codecov.yml` — update all 16 component `paths:` entries from
  `packages/holocron-plugin-*/**` to `plugins/holocron-plugin-*/**`.
  (Bonus, same file: `holocron-plugin-netlify` has no component block at
  all today — an existing gap, not caused by this move — add it while
  touching every other entry anyway.)

### C. `@theholocron/astromech` (shared, org-wide — used by every repo's

`holocron repo setup`, not only this one)

- `src/generators/codecov.ts` — `WorkspacePackage.dir` widens from
  `"packages" | "apps"` to also allow `"plugins"`; `readWorkspacePackages()`
  calls `readWorkspaceDir(repoRoot, "plugins")` alongside the existing two.
  `codecovComponentBlock()`'s path-building already reads `dir ?? "packages"`
  generically — no change needed there.
- `src/tasks/deploy-on-release.ts` — `workspacePackages()` is currently
  hardcoded to `packages/*` (no plugin uses `delivery.deploy` today,
  so this isn't a live bug, but it's the same shape of hardcode and should
  scan `plugins/*` too for consistency going forward).
- Both get test coverage for the new root.

Fixing (C) also fixes `packages/cli/src/commands/setup/derived-properties.ts`'s
custom-properties sync for free — `readWorkspacePackageJsons()` there
already reads `join(repoRoot, dir, slug, "package.json")` using whatever
`dir` each `WorkspacePackage` carries; it never hardcodes `"packages"`
itself. Update its doc comment (line ~21) referencing the old path.

### D. `@theholocron/cli` plugin scaffolding (`holocron new plugin`)

- `src/commands/plugin-create/index.ts` — the generated package's target
  directory (`path.join(cwd, "packages", ...)` → `"plugins"`). The
  `preflight()` check for `packages/` existing as the "is this a monorepo
  root" signal stays as-is — core packages still live there. Doc comments
  referencing the old output path need updating too.
- `templates/package-json.ts` — generated `homepage` and
  `repository.directory` fields point at `packages/holocron-plugin-<slug>`
  today; must become `plugins/holocron-plugin-<slug>` so npm/GitHub source
  links resolve correctly for every _new_ plugin going forward.
- `templates/validate-script.ts` — doc comment + one generated
  error-message string referencing the old path.
- Existing tests asserting the scaffolded path need updating.

### E. Sentinel (`@theholocron/sentinel`) — parallel, GitHub-App-side

mirrors of the same checks, independently hardcoded

- `src/actions/repo-validation/validate-docs-presence/validate-docs-presence.ts` —
  `NEW_PACKAGE_ENTRY = /^packages\/([^/]+)\/src\/index\.ts$/` needs a
  `plugins` alternation, or it silently stops flagging missing docs for
  _new_ plugin packages (advisory-only check, so not a hard failure, but a
  real regression in what it catches).
- `src/actions/repo-validation/validate-registry/validate-registry.ts` — same shape,
  `PACKAGE_MANIFEST = /^packages\/[^/]+\/package\.json$/`.
- `src/actions/capability-compliance/sync-properties/sync-properties.ts` —
  `WORKSPACE_PACKAGE_JSON = /^(?:packages|apps)\/[^/]+\/package\.json$/`
  needs `plugins` added to the alternation.
- Each has test coverage to extend alongside the regex change.

### F. Root validation scripts (CI-only, `platform.repoValidation`)

- `scripts/validate-registry.mjs` — hardcoded `readdirSync(join(root,
"packages"))`, one level, no recursion. Needs the same scan repeated
  against a `plugins/` directory (when present).
- `scripts/validate-docs-presence.mjs` — hardcoded regex
  `^packages\/([^/]+)\/src\/index\.ts$`, same fix shape as Sentinel's
  mirror above.

### G. Per-plugin files (16 packages)

- Every plugin's `package.json` — `homepage` and `repository.directory`
  fields (`packages/holocron-plugin-<name>` → `plugins/holocron-plugin-
<name>`), 2 occurrences each, always the same two fields.
- 15 of the 16 have a `scripts/validate.mjs` (every one but `fern`) with
  one error-message line referencing their own doc path — same
  substitution.

### H. Docs

- `.claude/skills/holocron-skill-plugin/SKILL.md` — "produces 18 files
  under `packages/holocron-plugin-<slug>/`" → `plugins/holocron-plugin-
<slug>/`.
- `CLAUDE.md`'s "Repo layout" diagram and `README.md`'s "Repo layout (v2)"
  diagram — both restructure the same way: `packages/` keeps the 5
  core packages; a new top-level `plugins/` block lists the 16 vendor
  packages with their existing one-line descriptions. (`README.md`'s
  version is already missing `rollup-plugin-transform-template` and
  `holocron-plugin-netlify` — pre-existing drift, fixed while rewriting
  the block anyway since both are being listed fresh.)

### Explicitly out of scope

- The 7 `docs/wiki/specifications/*.spec.md` files that mention
  `packages/holocron-plugin-*` are all `status: archived` — historical
  decision records describing the repo as it was when written. Left
  alone, per this repo's own convention that archived specs aren't living
  docs.
- `@theholocron/registry-doc`'s package registry keys by package _name_
  (`@theholocron/holocron-plugin-github`), not path — unaffected.
- No change to any plugin's own internal code, tests, or behavior — this
  is a pure path move plus the discovery/scaffolding/doc updates needed to
  keep everything finding it in the new location.

## Verification plan

- `holocron run ci` green, twice, after the move.
- `holocron new plugin <slug> <vendor>` scaffolds into `plugins/` and
  passes its own verify step.
- `pnpm --filter @theholocron/astromech test` covers the new `plugins`
  root in `readWorkspacePackages()` and `workspacePackages()`.
- `pnpm --filter @theholocron/sentinel test` covers the widened regexes.
- Spot-check `codecov.yml`'s generated paths and `knip.config.ts`'s
  workspace key resolve correctly (knip run clean, no "unknown workspace"
  warnings).
- Confirm `git log --follow` on a couple of moved files still shows full
  history through the move (sanity-check `git mv` preserved it).

## PR-stack

One PR: the moves plus every touch-point above. Not split further — every
piece is required for the move to actually work (a partial move leaves
either discovery or scaffolding pointed at the wrong place).
