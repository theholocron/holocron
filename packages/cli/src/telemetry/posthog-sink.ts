/**
 * `PostHogSink` — the **only** `posthog-node` call site. A portable
 * `AnalyticsSink` adapter: usage, adoption, retention. It reads no environment
 * and ships no credentials — the constructor takes a resolved `key` + `host`;
 * the caller (the CLI's `telemetry.ts`, via `telemetry/resolve.ts`) owns the
 * env chain and the fallback. An empty `key` is the caller's signal to install
 * a `NoopAnalyticsSink` instead — it is never passed here.
 *
 * Destined for `@theholocron/observability/analytics` (#635).
 */

import { PostHog } from "posthog-node";

import type { AnalyticsSink } from "./sinks.js";

export class PostHogSink implements AnalyticsSink {
	#client: PostHog;

	constructor(config: { key: string; host: string }) {
		this.#client = new PostHog(config.key, { host: config.host });
	}

	identify(distinctId: string, props: Record<string, unknown>): void {
		this.#client.identify({ distinctId, properties: props });
	}

	capture(distinctId: string, event: string, props: Record<string, unknown>): void {
		this.#client.capture({ distinctId, event, properties: props });
	}

	async shutdown(): Promise<void> {
		await this.#client.shutdown();
	}
}
