import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { PostHogSink } from "@theholocron/observability/analytics";
import {
	type AnalyticsSink,
	type CommandSpan,
	type ErrorSink,
	NoopAnalyticsSink,
	NoopErrorSink,
	redactObject,
} from "@theholocron/observability/core";
import { SentrySink } from "@theholocron/observability/errors";

import type { CliTelemetry, CreateCliTelemetryOptions, TelemetryConfig } from "./create-cli-telemetry.type.js";

const env = createEnvLookup();

/**
 * Anonymous, stable per-machine id: `sha256(hostname + username)` truncated.
 * One-way, so no raw hostname or username is ever transmitted.
 */
function machineId(): string {
	try {
		return createHash("sha256").update(`${hostname()} ${userInfo().username}`).digest("hex").slice(0, 32);
	} catch {
		return "unknown";
	}
}

/**
 * Create a CLI's self-telemetry: error reporting (Sentry) and usage analytics
 * (PostHog) behind the `ErrorSink` / `AnalyticsSink` seam of
 * `@theholocron/observability`. No-op sinks are installed until `init` finds
 * telemetry enabled, and the single kill switch is `<PREFIX>_TELEMETRY=false`
 * (legacy alias `NO_<PREFIX>_TELEMETRY`). The credentials are passed in, since
 * this reads no environment for them.
 *
 * @example
 * const telemetry = createCliTelemetry({
 *   envPrefix: "ACME",
 *   dsn: () => "https://key@o1.ingest.sentry.io/1",
 *   posthogKey: () => "phc_key",
 *   posthogHost: () => "https://us.i.posthog.com",
 * });
 */
export function createCliTelemetry(options: CreateCliTelemetryOptions): CliTelemetry {
	const { envPrefix, dsn, posthogKey, posthogHost, getRunId = () => undefined } = options;

	let errors: ErrorSink = new NoopErrorSink();
	let analytics: AnalyticsSink = new NoopAnalyticsSink();
	let commandStartedAt = 0;
	let currentCommand = "unknown";
	let lastErrorType: string | undefined;
	let currentSpan: CommandSpan | undefined;

	const isEnabled = (): boolean =>
		env.get(`${envPrefix}_TELEMETRY`) !== "false" && !env.get(`NO_${envPrefix}_TELEMETRY`);

	function baseProps(): Record<string, unknown> {
		const runId = getRunId();
		return { command: currentCommand, ci: Boolean(env.get("CI")), ...(runId ? { runId } : {}) };
	}

	function event(name: string, properties: Record<string, unknown> = {}): void {
		analytics.capture(machineId(), name, redactObject({ ...baseProps(), ...properties }));
	}

	function resetSinks(): void {
		errors = new NoopErrorSink();
		analytics = new NoopAnalyticsSink();
	}

	return {
		init(version: string): void {
			const resolvedDsn = dsn();
			if (isEnabled() && resolvedDsn !== "") {
				errors = new SentrySink();
				errors.init({
					dsn: resolvedDsn,
					release: `${envPrefix.toLowerCase()}@${version}`,
					environment: env.get("CI") ? "ci" : "local",
					tags: { os: process.platform, node: process.version, ci: String(Boolean(env.get("CI"))) },
				});
			}
			const resolvedKey = posthogKey();
			if (isEnabled() && resolvedKey !== "") {
				analytics = new PostHogSink({ key: resolvedKey, host: posthogHost() });
				const org = env.get(`${envPrefix}_ORG`);
				analytics.identify(machineId(), {
					ci: Boolean(env.get("CI")),
					os: process.platform,
					node: process.version,
					cli: version,
					...(org ? { org } : {}),
				});
			}
		},

		applyConfig(cfg: TelemetryConfig | undefined): void {
			if (!cfg) return;
			// Best-effort drain: a rejected close() must not surface as an unhandled rejection.
			const drain = (p: Promise<unknown>): void => {
				p.catch(() => {});
			};
			if (cfg.enabled === false) {
				drain(errors.flush());
				drain(analytics.shutdown());
				resetSinks();
				return;
			}
			if (cfg.analytics === "none") {
				drain(analytics.shutdown());
				analytics = new NoopAnalyticsSink();
			}
		},

		event,

		startCommand(name: string): (ok: boolean) => void {
			currentCommand = name;
			commandStartedAt = Date.now();
			lastErrorType = undefined;
			currentSpan = errors.startSpan(name);

			event("command_started", { dry_run: process.argv.includes("--dry-run") });

			return (ok: boolean) => {
				currentSpan?.setStatus(ok);
				currentSpan?.end();
				event(ok ? "command_completed" : "command_failed", {
					status: ok ? "ok" : "fail",
					duration_ms: Date.now() - commandStartedAt,
					...(ok || !lastErrorType ? {} : { error_type: lastErrorType }),
				});
			};
		},

		captureException(err: unknown): void {
			lastErrorType = err instanceof Error ? err.constructor.name : "Error";
			errors.captureException(err);
		},

		endSession(): void {
			errors.endSession();
		},

		async flush(): Promise<void> {
			await errors.flush();
			await analytics.shutdown();
			resetSinks();
		},

		resetTelemetry(): void {
			resetSinks();
			commandStartedAt = 0;
			currentCommand = "unknown";
			lastErrorType = undefined;
			currentSpan = undefined;
		},
	};
}
