/**
 * `PostHogSink` — the **only** `posthog-node` import in the CLI. Product
 * analytics (usage, adoption, retention), activated self-contained per ADR-0008:
 *
 *   HOLOCRON_POSTHOG_PROJECT_TOKEN  →  POSTHOG_PROJECT_TOKEN  →  built-in fallback key
 *   HOLOCRON_POSTHOG_HOST           →  POSTHOG_HOST           →  https://us.i.posthog.com
 *
 * The built-in fallback is an ingest-only project write key (`phc_…`) — it can
 * capture events, never read data — so it ships in the published package, the
 * same risk model as the hard-coded Sentry DSN. {@link resolvePostHogKey}
 * returning `""` is how the caller decides to install a `NoopAnalyticsSink`.
 */

import { PostHog } from "posthog-node";

import { env } from "../env.js";
import type { AnalyticsSink } from "./sinks.js";

const FALLBACK_POSTHOG_PROJECT_TOKEN = "phc_AC4vFCvYzwnzmG7Vg5nEc3PZKZztoPyfKp4Lb9BbXcLK"; // gitleaks:allow
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Resolve the PostHog project key. `""` → usage analytics disabled. */
export function resolvePostHogKey(): string {
	return (
		env.get("HOLOCRON_POSTHOG_PROJECT_TOKEN") ?? env.get("POSTHOG_PROJECT_TOKEN") ?? FALLBACK_POSTHOG_PROJECT_TOKEN
	);
}

export function resolvePostHogHost(): string {
	return env.get("HOLOCRON_POSTHOG_HOST") ?? env.get("POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST;
}

export class PostHogSink implements AnalyticsSink {
	#client: PostHog;

	constructor() {
		this.#client = new PostHog(resolvePostHogKey(), { host: resolvePostHogHost() });
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
