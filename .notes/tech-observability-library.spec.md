---
status: draft
issue: theholocron/holocron#634
blocked-by: []
related:
  - theholocron/holocron#633
  - theholocron/holocron#635
  - theholocron/holocron#636
  - theholocron/holocron#637
  - theholocron/holocron#638
  - theholocron/holocron#454
---

# `@theholocron/observability` — extraction plan

> **Phase A shipped (2026-09).** `theholocron/observability` created (public,
> MIT); `@theholocron/observability@0.2.0` published with subpath exports
> (`/core` `/logger` `/errors` `/analytics`); `ConsoleLogger` added;
> `@theholocron/cli` migrated off `@theholocron/logger` + the local telemetry
> adapters; `packages/logger` deleted; `@theholocron/logger` deprecated on npm.
> Phase B (#637 browser/edge/RN adapters, #638 `clients` seam) remains.
>
> Secondary-repo tooling gaps surfaced during the work: #641 (`npm publish-initial`)
> and #642 (`holocron new` drops `tasks` from the generated config).

Epic #633. This spec covers **Phase A**: extract the three telemetry seams
(logs / errors / analytics) plus the Node adapters into a standalone
`@theholocron/observability` package, built so the browser / edge / React
Native adapters (Phase B, #637) drop in later without a breaking change.

Phase A ships value to the one consumer we have today (`@theholocron/cli`) and
leaves a published, documented package ready for **rando** — whose Next.js
server / API / admin surfaces can use the Node adapters on day 1, with the
browser + Expo adapters added as small focused PRs once rando exists.

## Decisions carried from #633

| #   | Decision                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One package, subpath exports.** `/core` (zero-dep interfaces + Noops + redact), `/logger`, `/errors`, `/analytics`. Vendor SDKs are **optional peer deps**. Not a package-per-sink.                                                          |
| D2  | **Orchestration stays in the consumer.** The library ships interfaces + adapters + Noops + redact. `machineId`, the event catalog, the `HOLOCRON_TELEMETRY` gate, the Holocron fallback DSN/key — all stay in `packages/cli/src/telemetry.ts`. |
| D3  | **New repo `theholocron/observability`**, `theholocron/clients` shape. Independent versioning.                                                                                                                                                 |
| D4  | `@theholocron/logger` folds in; old name gets `npm deprecate`, no living alias.                                                                                                                                                                |
| D5  | **Multi-runtime from day 1** — `/core` is runtime-agnostic; concrete adapters are per-runtime. Phase A ships only the Node adapters, but the `exports` map and `/core` surface are designed for the rest.                                      |

## Phase A scope

**In:** new repo + package skeleton; `/core`; `/logger` (Pino + `ConsoleLogger`);
`/errors` + `/analytics` Node adapters; first publish; registry + docs;
migrate `@theholocron/cli`; delete `packages/logger`; tombstone
`@theholocron/logger`; drop `@sentry/node` / `posthog-node` / `pino` /
`pino-pretty` / `@axiomhq/pino` from this monorepo.

**Out (Phase B, #637 / #638):** `posthog-js`, `posthog-react-native`,
`@sentry/react-native`, the Next.js-Sentry story, `createObservability()`
orchestrator, the `clients` error-sink seam, the cross-language event contract
for Swift. `astromech` already has its seam (`RunLogger` structural interface,
no dep) — nothing to do there.

## Package layout

Single package, tsdown multi-entry. `theholocron/node-template` base.

```jsonc
// package.json (abridged)
{
  "name": "@theholocron/observability",
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./core": { "types": "./dist/core.d.mts", "import": "./dist/core.mjs" },
    "./logger": { "types": "./dist/logger.d.mts", "import": "./dist/logger.mjs" },
    "./errors": { "types": "./dist/errors.d.mts", "import": "./dist/errors.mjs" },
    "./analytics": { "types": "./dist/analytics.d.mts", "import": "./dist/analytics.mjs" },
    ".": { "types": "./dist/index.d.mts", "import": "./dist/index.mjs" },
  },
  "peerDependencies": {
    "@sentry/node": "*",
    "posthog-node": "*",
    "pino": "*",
    "pino-pretty": "*",
    "@axiomhq/pino": "*",
  },
  "peerDependenciesMeta": {
    "@sentry/node": { "optional": true },
    "posthog-node": { "optional": true },
    "pino": { "optional": true },
    "pino-pretty": { "optional": true },
    "@axiomhq/pino": { "optional": true },
  },
}
```

- `./core` imports nothing — safe in any bundle. `redact` lives here (both the
  Pino `REDACTED_PATHS` field-path list **and** the telemetry string-scrub
  `redact` / `redactObject` — different layers, both belong to core).
- `.` root re-exports the subpaths for convenience. **No `createObservability()`
  in Phase A** — deferred until Phase B has two real wirings to generalise from.
- Reserve `./errors/browser`, `./analytics/react-native`, etc. as **future**
  subpath additions — additive, non-breaking.

## Code disposition

| Source (holocron)                               | → Destination                                 | Notes                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/telemetry/sinks.ts`           | `observability/src/core/sinks.ts`             | verbatim: `ErrorSink`, `AnalyticsSink`, `CommandSpan`, `NoopErrorSink`, `NoopAnalyticsSink`                                                                   |
| `packages/cli/src/telemetry/redact.ts`          | `observability/src/core/redact.ts`            | merge with logger's `redact.ts` (`REDACTED_PATHS`, `redactOptions`) — one module, two exports                                                                 |
| `packages/logger/src/interface.ts`              | `observability/src/core/logger-interface.ts`  | `Logger`, `LogLevel`, `LOG_LEVELS`, `LogEnv`                                                                                                                  |
| `packages/cli/src/telemetry/sentry-sink.ts`     | `observability/src/errors/sentry-sink.ts`     | **drop the hardcoded `FALLBACK_DSN`.** `SentrySink.init({ dsn, ... })` takes a resolved DSN. `resolveDsn()` (env chain + Holocron fallback) stays in the CLI. |
| `packages/cli/src/telemetry/posthog-sink.ts`    | `observability/src/analytics/posthog-sink.ts` | same — drop `FALLBACK_POSTHOG_PROJECT_TOKEN`; `resolvePostHogKey()` stays in the CLI                                                                          |
| `packages/logger/src/pino.ts`                   | `observability/src/logger/pino.ts`            | `PinoLogger`, `createPinoInstance`, `buildPinoOptions`                                                                                                        |
| `packages/logger/src/transports.ts`             | `observability/src/logger/transports.ts`      | verbatim                                                                                                                                                      |
| `packages/logger/src/context.ts`                | `observability/src/logger/context.ts`         | `resolveAxiomFromEnv` keeps the `HOLOCRON_AXIOM_*` names as a documented convenience; generic otherwise                                                       |
| `packages/logger/src/index.ts` (`createLogger`) | `observability/src/logger/index.ts`           | stays generic                                                                                                                                                 |
| — new —                                         | `observability/src/logger/console.ts`         | `ConsoleLogger implements Logger` — zero-dep, ~30 lines, for browser / RN / the CLI's pre-Pino paths                                                          |

**Stays in `packages/cli/src/telemetry.ts`:** `resolveDsn` + `FALLBACK_DSN`,
`resolvePostHogKey` + `FALLBACK_POSTHOG_PROJECT_TOKEN`, `machineId`,
`baseProps`, `isEnabled` (the `HOLOCRON_TELEMETRY` gate), `init`,
`startCommand`, `applyConfig`, the event names, `resetTelemetry`.

## Implementation steps

### 1 — repo (`#635`)

1. `holocron new node observability` → `theholocron/observability` from `node-template`.
2. `package.json`: name, `exports` map, optional peer deps, `engines.node >=22`.
3. `tsdown.config.ts`: entries `core`, `logger`, `errors`, `analytics`, `index`.
4. `holocron.config.ts`: `defineConfig`, `project.workflows` = `["lint","test","typecheck","audit","release"]`.
5. `holocron setup` against the repo — thin-caller workflows, branch protection, `.alexrc`, etc.
6. **User action:** register the npm Trusted Publisher (GitHub Actions / theholocron / observability / release.yml, label `holocron-release`).

### 2 — port + test (`#635`, `#636`)

7. Create `src/core/`, `src/logger/`, `src/errors/`, `src/analytics/` per the disposition table.
8. Move the vitest suites alongside; retarget imports. Per-module coverage floor 90% (org standard).
9. Add `ConsoleLogger` + its test.
10. `pnpm build && pnpm test && pnpm typecheck && pnpm lint` green in the new repo.

### 3 — first publish (`#636`)

11. `npm login --auth-type=web` → `pnpm install && pnpm build` → `pnpm exec holocron npm publish-initial` → `@theholocron/observability@0.1.0`.
12. Registry entry — PR to `theholocron/docs` adding `@theholocron/observability` to `@theholocron/registry-doc`; release it; note the new version.
13. `docs-theme` registry entry for the new repo (org-wide project list).

### 4 — migrate the CLI (`#636`)

14. `pnpm-workspace.yaml`: add `'@theholocron/observability': ^0.1.0` to `catalog:`; **remove** `@axiomhq/pino`, `@sentry/node`, `pino`, `pino-pretty`, `posthog-node`.
15. `packages/cli/package.json`: `@theholocron/logger: workspace:*` → `@theholocron/observability: catalog:`. Drop the SDK deps.
16. `rm -rf packages/logger`. Update `scripts/bump-versions.mjs` (9 → 8 lockstep packages), `codecov.yml` (drop the `logger` component), root `knip.config.ts`.
17. Rewrite imports:
    - `@theholocron/logger` → `@theholocron/observability/logger` (runtime) or `@theholocron/observability/core` (types like `LogLevel`).
    - `packages/cli/src/telemetry/{sinks,redact,sentry-sink,posthog-sink}.ts` deleted; `telemetry.ts` imports `SentrySink` / `PostHogSink` / `Noop*` / `redactObject` from `@theholocron/observability/{errors,analytics,core}`.
18. `git grep -nE "@sentry/node|posthog-node|from \"pino\"|@axiomhq" packages/` → **empty**.
19. `holocron ci` green. `pnpm -C docs build` green.

### 5 — tombstone (`#636`)

20. `npm deprecate "@theholocron/logger@<=4.x" "moved to @theholocron/observability — use @theholocron/observability/logger"`. No re-export release (no external consumer).
21. AGENTS.md / CLAUDE.md: update the "no observability SDK outside its adapter module" bullet — the adapter modules now live in `@theholocron/observability`, not `packages/cli/src/telemetry/`. `git grep` guard becomes `git grep … packages/ → empty`.
22. ADR-0007 + ADR-0008: "as-built" note — the seam is now a published package.

## Sequencing / risk

- **Chicken-and-egg:** the CLI can only `catalog:` `@theholocron/observability`
  after step 11 publishes it. Steps 1–3 fully precede step 4. During 1–3 the
  monorepo is untouched and green.
- **One-way move.** Once `packages/logger` is deleted (step 16) the CLI is
  broken until step 17 finishes — do 14–19 in one PR / one sitting.
- **`holocron new` + `holocron setup`** are proven (logger, axiom plugin). The
  Trusted-Publisher + `publish-initial` dance is documented in
  `docs/self-hosting.md`.
- **No external consumer of `@theholocron/logger`** — `git grep` across sibling
  repos is clean, so the migration is monorepo-local.

## Open questions (Phase B / #634 follow-up)

- Does the library wrap Sentry for Next.js at all, or only expose `ErrorSink` +
  a `SentryNextjsSink` shim (apps install `@sentry/nextjs` directly)?
- Does `createObservability(config)` belong in the library, or is every
  consumer's wiring different enough that `.` stays pure re-exports?
- rando v1: all three sinks, or `errors` + `logger` first?
- The cross-language event + redaction contract for the Swift side.

## Verification (Phase A done)

```bash
# in theholocron/observability
pnpm build && pnpm test && pnpm typecheck && pnpm lint

# in theholocron/holocron
holocron ci
pnpm -C docs build
node scripts/validate-registry.mjs          # observability registered; logger gone from packages/
git grep -nE "@sentry/node|posthog-node|@axiomhq/pino|from \"pino\"" packages/   # empty
npm view @theholocron/logger  deprecated     # shows the tombstone message
```
