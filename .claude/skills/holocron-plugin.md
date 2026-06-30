---
name: holocron-plugin
description: Scaffold a new @theholocron/holocron-plugin-<slug> package matching the proven template (auth + REST + capability impl + tests). Use when adding a plugin for a new vendor or extracting an existing Rando adapter.
---

# Scaffold a new holocron plugin

Use this skill when the user asks for a new holocron plugin (Clerk, Doppler,
Cloudflare, etc.) or when porting one of Rando's existing adapters into a
plugin package. The output matches the structure that's already been proven
in `packages/holocron-plugin-{github,vercel,neon}`.

## What you generate

This skill produces ~14 files under `packages/holocron-plugin-<slug>/`:

- `package.json` — workspace package, peer-deps `@theholocron/cli`
- `tsconfig.json` — extends `@tsconfig/node-lts`
- `vitest.config.ts` — v8 coverage, node env
- `eslint.config.js` — re-exports the root config
- `README.md` — auth instructions, config example, status
- `src/auth.ts` — token resolver (`--token` → `HOLOCRON_<VENDOR>_<KIND>` → vendor-native env)
- `src/rest.ts` — bearer + transport-failure wrapping (`status: 0` on DNS/TCP/TLS)
- `src/index.ts` — `createPlugin(options)` wiring the capability factories
- `src/capabilities/<capability>.ts` — class implementing the capability interface, methods stubbed
- `src/__tests__/helpers.ts` — `stubFetch` (port of the rando helper)
- `src/__tests__/auth.test.ts` — token resolution
- `src/__tests__/rest.test.ts` — REST client behavior
- `src/__tests__/<capability>.test.ts` — capability behavior (one passing smoke test per stub method)
- `src/__tests__/index.test.ts` — `createPlugin()` wires everything

What it does NOT generate: actual API method bodies. Those are vendor-specific
and easy to get wrong — scaffold and stubs only; the human (or the next
conversation turn) fills in the real implementations.

## Step 1 — gather inputs

Use `AskUserQuestion` to collect the following BEFORE writing any files. Group
into one or two question batches; don't ask one at a time.

| Input                | Required | Example                                                                     |
| -------------------- | -------- | --------------------------------------------------------------------------- |
| Plugin slug          | yes      | `clerk`, `doppler`, `cloudflare`                                            |
| Vendor display name  | yes      | `Clerk`, `Doppler`, `Cloudflare`                                            |
| Capability key       | yes      | `auth`, `vault`, `dns`, `tooling`, `notifications` (one of the 14 in CARDINALITY) |
| Holocron token env   | yes      | `HOLOCRON_CLERK_TOKEN`                                                      |
| Vendor-native env    | yes      | `CLERK_SECRET_KEY`                                                          |
| Base URL             | yes      | `https://api.clerk.com/v1`                                                  |
| Rando source path    | no       | `packages/cli/src/adapters/clerk.ts` if porting                              |

If the capability is `many`-cardinality (per `CARDINALITY` in
`packages/cli/src/capabilities/index.ts`), warn the operator and confirm —
those need multiple instances to be active at once and the test patterns are
slightly different.

## Step 2 — verify the slug isn't taken

```bash
ls packages/holocron-plugin-<slug> 2>/dev/null && echo "exists"
```

If the directory exists, error out with a clear "already scaffolded" message —
do NOT overwrite an existing plugin.

## Step 3 — write the files

Use the existing plugins as the structural reference. The general rule: copy
the structure from `packages/holocron-plugin-neon/` (the cleanest of the
three), then substitute the plugin-specific names. Key substitutions:

- `Neon` → `<VendorName>` (PascalCase)
- `neon` → `<slug>` (kebab-case)
- `NEON` → `<VENDOR>` (UPPER)
- `HOLOCRON_NEON_API_KEY` → operator's chosen holocron env name
- `NEON_API_KEY` → operator's chosen vendor-native env name
- `https://console.neon.tech/api/v2` → base URL
- `NeonStorage` (capability class) → `<VendorName><CapabilityName>`
- `storage` (capability key) → operator's chosen capability key

The capability class methods are STUBS — each declared method has a `throw new
Error('not implemented')` body. The corresponding test cases are skipped via
`it.todo(...)`. Both the operator and the next conversation turn know
implementations are incoming.

### Patterns that are non-negotiable

- **Standards (see `.notes/tech-architecture.spec.md` §Standards).** Every
  plugin honors the three holocron-wide conventions:
  1. `--dry-run` is a global CLI flag flowing through `RuntimeContext.dryRun`.
     Commands branch on it; capabilities don't accept per-method dryRun args.
  2. `--token` is a global CLI flag flowing through `RuntimeContext.cliToken`.
     The plugin's `auth.ts` treats it as the first precedence in token resolution.
  3. For plugins that fire webhook-shaped events (auth, anything fires events on
     CRUD ops), export a `parseWebhook(input): NormalizedEvent` utility
     alongside `createPlugin`. The normalized event shape lives in
     `@theholocron/cli`; the plugin's job is just to translate.
- **Auth**: token resolution order is always `--token` → `HOLOCRON_<X>` →
  `<vendor-native>`. Throw `AuthError` with a message naming both env vars.
- **REST**: wrap transport failures (`TypeError: fetch failed`) into
  `ProviderApiError` with `status: 0`. Include the path in the message so
  callers see which call broke.
- **204 handling**: return `undefined` from `request<T>` on 204 OR when
  `expectNoContent: true` is set.
- **Tests use `stubFetch`**: copy the helper verbatim from
  `packages/holocron-plugin-neon/src/__tests__/helpers.ts`. The Response
  constructor rejects bodies on 204 — the helper handles that.
- **Workspace + catalog deps**: `@theholocron/tsconfig`, `@tsconfig/node-lts`,
  `eslint`, `globals`, `typescript`, `vitest`, `@vitest/coverage-v8` all
  resolve via `catalog:` from `pnpm-workspace.yaml`.
- **Peer-deps**: `@theholocron/cli` is BOTH a peer dep AND a devDep at
  `workspace:*` (the devDep lets tests resolve the types).
- **Underscore-prefix unused params, no eslint-disable comments.** The
  workspace ESLint config already has `argsIgnorePattern: '^_'` +
  `varsIgnorePattern: '^_'`. Adding `// eslint-disable-next-line
  @typescript-eslint/no-unused-vars` triggers the unused-directive lint
  warning. Just use `_name` and stop.
- **Don't `expect(...).toThrow()` twice on the same stubbed call.** The
  stub queue (`stubFetch` / `stubSpawn`) advances on every invocation.
  Calling the same async-with-fetch method twice exhausts the queued
  responses and the second call returns the default empty response —
  the assertion silently passes when it shouldn't, or fails for the
  wrong reason. **Correct pattern:**
  ```ts
  try {
    await something()
    throw new Error('expected throw')
  } catch (err) {
    expect(err).toBeInstanceOf(SomeError)
    expect((err as SomeError).message).toMatch(/regex/)
  }
  ```

## Step 4 — install + verify

ALL commands must run from the holocron repo root (`/path/to/theholocron/holocron`).
If the active shell is in another directory (e.g., a sibling project), `cd`
first — pnpm filters silently match nothing when run outside the workspace.

```bash
cd /path/to/theholocron/holocron
pnpm install                                                 # picks up the new workspace package
pnpm --filter @theholocron/holocron-plugin-<slug> typecheck   # green
pnpm --filter @theholocron/holocron-plugin-<slug> lint        # green
pnpm --filter @theholocron/holocron-plugin-<slug> test        # green (stubs pass, real tests are it.todo)
```

If ANY of these fail, surface the failure verbatim to the operator and stop —
the scaffold is broken and shouldn't be committed.

## Step 5 — print next steps

Show the operator a short summary:

```
✓ scaffolded packages/holocron-plugin-<slug>/ (14 files)
✓ typecheck + lint + test green

Next:
  1. Implement <Capability> methods in src/capabilities/<capability>.ts
  2. Replace `it.todo(...)` with real tests in src/__tests__/<capability>.test.ts
  3. Update README "What's implemented" section as you go
  4. Commit + push when capability is functionally complete
```

Don't commit. The skill stops at "scaffold + verify"; the human commits when
the capability is meaningfully implemented.

## Reference: known capability keys

Confirm the chosen capability key is one of these (from
`packages/cli/src/capabilities/index.ts`):

`source`, `ci`, `secrets`, `environments`, `issues`, `deployment`, `storage`,
`auth`, `vault`, `dns`, `tooling`, `notifications`, `analytics`,
`observability`.

If the operator wants a capability not in this list, that's a core change
first — the capability interface needs to be added to
`packages/cli/src/capabilities/index.ts` and `CARDINALITY` extended.

## Reference: Rando porting checklist

When porting an existing Rando adapter, also:

- Find the Rando source: `find /Users/archives/Code/rando/rando/packages/cli/src -name "*<slug>*"`
- Compare Rando's interface against the holocron capability interface BEFORE
  writing code. Adjust the holocron interface in core if the Rando shape
  reveals a mismatch — that's what happened with `Deployment`
  (drop `promote`/`listDeployments`, add `triggerDeployment`/`getDeployment`)
  and `Storage` (replace target-based `getConnectionString` with
  scope-based + pooled option).
- Port the implementation method-by-method. Keep Rando's comments where they
  document non-obvious gotchas (e.g., Neon's `endpoints[{type: 'read_write'}]`
  inline create, GitHub's reviewer numeric-id-only).
- Port the tests too — they're the proof the port preserves semantics.

## When NOT to use this skill

- The capability needs a transport other than REST (e.g., a CLI shell-out).
  The auth + REST primitives don't apply; structure differs. Use the manual
  approach + propose a transport-adapter interface (see issue #76).
- The plugin is a "config package" rather than a real implementation (see
  the level-1 shareable-configs design in issue #75). The structure for those
  is different.
- The work is a one-off tweak to an existing plugin, not a new one. Edit the
  existing package directly.
