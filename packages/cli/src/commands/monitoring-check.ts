/**
 * `holocron monitoring check <url>` — runs every configured `monitoring`
 * check against an arbitrary URL instead of each check's own configured
 * one (holocron#1010).
 *
 * Built for CI: the `delivery.previewCheck` task runs this against a
 * PR's Vercel preview deployment, reusing the exact same check
 * definitions already in `holocron.config.ts` for production — no
 * vendor API call, no separate checks-as-code file to keep in sync.
 */

import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../config/load-config.js";
import { getLogger } from "../logger.js";
import type { Monitoring } from "../plugin/capabilities.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";
import { runCheckAgainstUrl } from "../plugin/run-check.js";
import { assertPluginsResolvable } from "../plugin/workspace.js";

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

export async function runMonitoringCheck(input: RunMonitoringCheckInput): Promise<MonitoringCheckReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "monitoring check");

	// `get()` re-surfaces the monitoring provider's own load error (a bad
	// token, a constructor throw, …) when it was configured but failed to
	// load — never swallowed behind a generic "not configured" message,
	// which would send an operator chasing the wrong fix.
	const monitoring = loader.get("monitoring") as Monitoring;
	const run = input.runCheck ?? runCheckAgainstUrl;

	print(`Holocron monitoring check — against ${input.url}`);

	if (monitoring.checks.length === 0) {
		const message = "no monitoring checks configured — nothing to validate";
		print(`✗ ${message}`);
		logger.warn({ url: input.url }, "monitoring check: no checks configured");
		return { status: "fail", checks: [] };
	}

	const checks: MonitoringCheckSummary[] = [];
	for (const checkInput of monitoring.checks) {
		const result = await run(checkInput, { url: input.url });
		if (result.requestError) {
			print(`  ✗ ${checkInput.name}  (request failed: ${result.requestError})`);
			checks.push({ name: checkInput.name, passed: false, failures: [], requestError: result.requestError });
		} else if (result.passed) {
			print(`  ✓ ${checkInput.name}`);
			checks.push({ name: checkInput.name, passed: true, failures: [] });
		} else {
			print(`  ✗ ${checkInput.name}`);
			for (const failure of result.failures) print(`      ${failure}`);
			checks.push({ name: checkInput.name, passed: false, failures: result.failures });
		}
	}

	const failCount = checks.filter((c) => !c.passed).length;
	const status = failCount === 0 ? "ok" : "fail";
	print(`${status === "ok" ? "✓" : "✗"} ${checks.length - failCount} passed, ${failCount} failed`);
	logger.info({ url: input.url, total: checks.length, failed: failCount, status }, "monitoring check: done");
	return { status, checks };
}
