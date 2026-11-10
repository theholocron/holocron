---
id: SPEC-0049
status: proposed
issue: theholocron/holocron#637
blocked-by: []
related:
  - theholocron/holocron#633
  - theholocron/holocron#634
  - theholocron/holocron#638
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618567997263992
---

# `@theholocron/observability` — browser, edge and React Native adapters (Phase B)

Phase A (the `/core`, `/logger`, `/errors` and `/analytics` Node adapters, the CLI migration and the `@theholocron/logger` tombstone) shipped and is archived in `docs/wiki/specifications/tech-observability-library.spec.md`. The `clients` error-sink seam (#638) is done. This spec covers what was left of epic #633 and records the layout that was built for #637 (pull requests #2040 and #2042).

## Where things are now

- The package lives in `observability/` in this monorepo (#1207), as its own version group (tags `observability-v*`).
- `/core` imports nothing and is safe in any bundle. Concrete adapters are per runtime. There is still no `createObservability()` orchestrator.
- All vendor SDKs are optional peer dependencies.

## Implemented layout

One subpath per adapter, so importing one adapter never makes a bundler resolve another adapter's SDK (a single `/browser` entry that re-exported both would have forced `posthog-js` on an app that wants only Sentry). `src/entries.test.ts` checks the import graph of each entry.

| Subpath            | Adapter                                                                 | Loads                 |
| ------------------ | ----------------------------------------------------------------------- | --------------------- |
| `/browser/sentry`  | `SentryBrowserSink` (`ErrorSink`)                                       | `@sentry/browser`     |
| `/browser/posthog` | `PostHogBrowserSink` (`AnalyticsSink`)                                  | `posthog-js`          |
| `/edge/sentry`     | `SentryEdgeSink` (`ErrorSink`)                                          | `@sentry/vercel-edge` |
| `/edge/posthog`    | `PostHogFetchSink` (`AnalyticsSink`, PostHog's capture endpoint, fetch) | nothing               |
| `/react-native`    | `SentryReactNativeSink`, `PostHogReactNativeSink`                       | nothing (injected)    |

`ConsoleLogger` (`/logger`) stays the logger for all of them. Sentry for Next.js is not wrapped: an app that uses `@sentry/nextjs` implements `ErrorSink` itself or uses `/browser/sentry`.

Behaviour shared by the adapters:

- The Sentry sinks share one vendor-free `SentryCompatibleSink` that takes the SDK namespace. It uses the Node sink's span op (`holocron.command`) and `command` tag, and scrubs errors, transactions, span names and tags with `redactObject`.
- Every vendor call is guarded (`safely()`); an optional `onError(error, context)` sees what was swallowed and can never throw or loop.
- The PostHog sinks scrub event and person properties. A browser or React Native client has one current person, so `capture(distinctId, ...)` calls `identify(distinctId)` first when `distinctId` is not the client's current id. The browser sink starts `posthog-js` with autocapture, pageviews, page-leave events and session recording off and person profiles for identified people only.
- The fetch sink has a request timeout, no retry, an HTTP-status check, an optional `$anon_distinct_id` merge on `identify`, and a `shutdown(timeoutMs)` that refuses new events and waits for the accepted ones.
- `ErrorSink.init`'s `environment` is a free string (it was `"ci" | "local"`), and the `Noop*` classes take the interface's arguments, so a conditional `Noop*` or real sink type-checks.
- Opt-out stays the caller's job: install `Noop*` when the DSN or key is empty.

## Decision: React Native sinks take the SDK as an injected dependency

`@sentry/react-native` and `posthog-react-native` have required `react-native` peers. Installed as devDependencies for tests, they bring a whole React Native and Metro tree into `pnpm-lock.yaml` (about 1,800 lines) and change the peer variants of unrelated packages such as vite and astro. So these two sinks import no SDK: the app passes `import * as Sentry from "@sentry/react-native"` as `sdk` and a `new PostHog(key, { host })` as `client`. The SDKs are still declared as optional peers, the module loads in Node, tests use fakes, and, because nothing is imported, no vendor call site is added to the repo. The cost is that the SDK types are matched structurally (`SentrySdkLike`, `PostHogReactNativeClient`) and were not checked against the real React Native packages in this repo.

## Open questions

- Does `createObservability(config)` belong in the library, or is every consumer's wiring different enough that `.` stays pure re-exports?
- The cross-language event and redaction contract for the Swift side.
- Check `SentrySdkLike` and `PostHogReactNativeClient` (`getDistinctId()`) against the real React Native SDKs in the first app that adopts them.

## Status

The adapters are built and need the consumer's first real use: the next project (Rando) uses React, React Native and similar runtimes and adopts them. Nothing is blocked on building them any more.
