import type { CheckRow, CheckStatus } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What `holocron reconcile ci` needs to run. */
export interface RunReconcileCiInput {
	/** The loaded config: its tasks give the `expected` list, its `source` provider reads and posts the checks. */
	loaded: LoadedConfig;
	/** The run's context (`--dry-run`, tokens, the repository root). */
	context: RuntimeContext;
	/** One pull request to reconcile; without it every open pull request is. */
	pullRequest?: number;
	/** Minutes an unfinished aggregate may wait before the sweep counts it as stale; default 10. */
	maxAgeMinutes?: number;
	/**
	 * Repair Sentinel's shadow check (`ci / Required checks (sentinel)`) instead of the real one. The only way to post
	 * while `ci.aggregate` is `actions`, because the shadow is not required and the real check has another poster.
	 */
	shadow?: boolean;
	/** The plugin loader; the default builds one with only the `source` provider. */
	loader?: PluginLoader;
	/** Prints a line; the default is the console. */
	print?: (line: string) => void;
	/** The structured log. */
	logger?: Logger;
	/** The clock, in epoch milliseconds; the default is `Date.now`. */
	now?: () => number;
}

/** How a `reconcile ci` run ended. */
export interface ReconcileCiReport {
	/** `fail` when a pull request was stale past the grace, or a read or write failed; otherwise `ok`. */
	status: CheckStatus;
	/** One row per pull request. */
	rows: CheckRow[];
}
