import type { LogLevel } from "@theholocron/observability/core";

import type { TelemetryConfig } from "../../config/index.js";
import { buildCliLogger, type BuildCliLoggerOpts } from "../../observability/logger/index.js";
import { applyConfig } from "../../observability/telemetry/index.js";
import { resolveOrg } from "../resolve-org/index.js";

/**
 * `buildCliLogger` options derived from a loaded `holocron.config` — the
 * level, the Axiom dataset, and the resolved org for a keyring-backed
 * Axiom token. Used by every handler that has already called `loadConfig`.
 */
export function cliLoggerOpts(
	argv: { org?: string; verbose?: boolean; quiet?: boolean; log?: LogLevel },
	resolved: { org?: string; log?: { level?: LogLevel; axiom?: { dataset?: string } } }
): BuildCliLoggerOpts {
	return {
		configLevel: resolved.log?.level,
		configAxiomDataset: resolved.log?.axiom?.dataset,
		org: resolveOrg(argv, resolved),
	};
}

/**
 * Fold a loaded `holocron.config` into the running process: reconfigure the
 * logger from `log:`, then apply the `telemetry:` override layer. Every handler
 * that has called `loadConfig` runs this, so a repo's `telemetry.enabled: false`
 * (or `analytics: "none"`) is honoured for that command. Env still wins —
 * `applyConfig` only narrows what `init` already turned on.
 */
export function applyResolvedConfig(
	argv: { org?: string; verbose?: boolean; quiet?: boolean; log?: LogLevel },
	resolved: {
		org?: string;
		log?: { level?: LogLevel; axiom?: { dataset?: string } };
		telemetry?: TelemetryConfig;
	}
): void {
	buildCliLogger(argv, cliLoggerOpts(argv, resolved));
	applyConfig(resolved.telemetry);
}
