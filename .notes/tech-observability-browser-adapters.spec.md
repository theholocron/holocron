---
status: draft
issue: theholocron/holocron#637
blocked-by: []
related:
  - theholocron/holocron#633
  - theholocron/holocron#634
  - theholocron/holocron#638
---

# `@theholocron/observability` — browser, edge and React Native adapters (Phase B)

Phase A (the `/core`, `/logger`, `/errors` and `/analytics` Node adapters, the CLI migration and the `@theholocron/logger` tombstone) shipped and is archived in `docs/wiki/specifications/tech-observability-library.spec.md`. The `clients` error-sink seam (#638) is done. This spec covers what is left of epic #633.

## Where things are now

- The package lives in `observability/` in this monorepo (#1207), as its own version group (tags `observability-v*`, currently 0.6.x).
- Subpath exports today: `.`, `./core`, `./logger`, `./errors`, `./analytics`, `./testing`. All vendor SDKs are optional peer dependencies.
- `/core` imports nothing and is safe in any bundle. Concrete adapters are per runtime.
- There is still no `createObservability()` orchestrator. It was deferred until there are two real wirings to generalise from.

## Scope

Add the non-Node adapters so rando's browser, edge and Expo surfaces can use the same `/core` interfaces. Each is an additive subpath, not a breaking change:

- `/analytics`: `posthog-js` (browser), `posthog-react-native` (Expo), and a fetch-based capture for edge runtimes with no `posthog-node`.
- `/errors`: `@sentry/react-native` (Expo). Next.js per the first open question below.
- `/logger`: `ConsoleLogger` already exists for browser and React Native, where Pino is too heavy. Phase B only has to make the export conditions pick the right adapter per runtime.

## Open questions

- Does the library wrap Sentry for Next.js at all, or only expose `ErrorSink` plus a `SentryNextjsSink` shim, with apps installing `@sentry/nextjs` themselves?
- Does `createObservability(config)` belong in the library, or is every consumer's wiring different enough that `.` stays pure re-exports?
- rando v1: all three sinks, or `errors` and `logger` first?
- The cross-language event and redaction contract for the Swift side.

## Blocked on

A second real consumer. Nothing in this repo needs the browser or React Native adapters, so this waits for rando (or another app) to exist. Until then there is nothing to build against.
