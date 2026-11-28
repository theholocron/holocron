/** The `telemetry` block of a CLI's config file: the committed override layer. */
export interface TelemetryConfig {
	/** `false` installs the no-op sinks for the whole run. Default on. */
	enabled?: boolean;
	/** `"none"` disables usage analytics but leaves error reporting on. Default `"posthog"`. */
	analytics?: "posthog" | "none";
}

export interface CreateCliTelemetryOptions {
	/**
	 * Upper-case env prefix of the CLI, e.g. `"HOLOCRON"`. Reads
	 * `<PREFIX>_TELEMETRY` (`false` opts out), the legacy `NO_<PREFIX>_TELEMETRY`
	 * and `<PREFIX>_ORG`; the Sentry release is `<prefix lower-cased>@<version>`.
	 */
	envPrefix: string;
	/** Resolve the Sentry DSN at `init` time. `""` disables error reporting. */
	dsn: () => string;
	/** Resolve the PostHog project key at `init` time. `""` disables usage analytics. */
	posthogKey: () => string;
	/** Resolve the PostHog ingest host at `init` time. */
	posthogHost: () => string;
	/** The logger's correlation id, attached to events as `runId`. */
	getRunId?: () => string | undefined;
}

/** The bound telemetry functions a CLI re-exports. */
export interface CliTelemetry {
	/** Install the live sinks unless the opt-out is set or a credential is empty. */
	init: (version: string) => void;
	/** Apply the config block: it only ever narrows what `init` turned on. */
	applyConfig: (cfg: TelemetryConfig | undefined) => void;
	/** Capture a usage event; properties run through the secret scrubber. */
	event: (name: string, properties?: Record<string, unknown>) => void;
	/** Start a command span; call the returned function with the outcome. */
	startCommand: (name: string) => (ok: boolean) => void;
	/** Report an error to the error sink. */
	captureException: (err: unknown) => void;
	/** End the error-reporting session. */
	endSession: () => void;
	/** Drain both sinks and return to the no-ops. */
	flush: () => Promise<void>;
	/** Test hook: drop sinks and command state back to the no-op defaults. */
	resetTelemetry: () => void;
}
