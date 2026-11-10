/**
 * `@theholocron/observability/edge/posthog`: the `AnalyticsSink` for an edge or
 * worker runtime, over PostHog's HTTP capture endpoint with `fetch` alone.
 *
 * Importing this entry loads no SDK at all, so it has no peer dependency. The
 * caller resolves the project key; this module reads no environment and
 * imports no Node built-in.
 */

export type { FetchLike, FetchResponseLike, PostHogFetchSinkConfig } from "./edge/posthog-fetch-sink.js";
export { PostHogFetchSink } from "./edge/posthog-fetch-sink.js";
export type { OnError } from "./shared/safe.js";
