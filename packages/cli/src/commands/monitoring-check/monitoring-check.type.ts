import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, runCheckAgainstUrl, type RuntimeContext } from "../../plugin/index.js";

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

export interface RunMonitoringCheckInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** URL to test every configured check against, instead of each check's own configured `url`. */
	url: string;
	loader?: PluginLoader;
	print?: MonitoringCheckPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. Defaults to the real HTTP-driven evaluator. */
	runCheck?: typeof runCheckAgainstUrl;
}
