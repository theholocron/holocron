import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import {
	type MonitoringCheckInput,
	PluginLoader,
	runCheckAgainstUrl,
	type RuntimeContext,
} from "../../plugin/index.js";

export type MonitoringCheckPrint = (line: string) => void;

export interface MonitoringCheckSummary {
	name: string;
	passed: boolean;
	failures: string[];
	/** Set only when the request itself failed (network error, timeout, etc.). */
	requestError?: string;
}

export interface MonitoringCheckReport {
	status: "ok" | "fail";
	checks: MonitoringCheckSummary[];
}

export interface ResolveMonitoringChecksInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
}

export interface ReportChecksInput {
	/** Already-resolved check definitions — e.g. from `resolveMonitoringChecks`, or read back from a file a separate, untrusted process wrote. */
	checks: MonitoringCheckInput[];
	/** URL to test every check against, instead of each check's own configured `url`. */
	url: string;
	/** Extra headers merged into every check's request — e.g. a Deployment Protection bypass header (holocron#1030). */
	headers?: Record<string, string>;
	print?: MonitoringCheckPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. Defaults to the real HTTP-driven evaluator. */
	runCheck?: typeof runCheckAgainstUrl;
}

export interface RunMonitoringCheckInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** URL to test every configured check against, instead of each check's own configured `url`. */
	url: string;
	/** Extra headers merged into every check's request — e.g. a Deployment Protection bypass header (holocron#1030). */
	headers?: Record<string, string>;
	loader?: PluginLoader;
	print?: MonitoringCheckPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. Defaults to the real HTTP-driven evaluator. */
	runCheck?: typeof runCheckAgainstUrl;
}
