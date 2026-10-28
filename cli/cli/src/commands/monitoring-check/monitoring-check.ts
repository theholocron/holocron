/**
 * `holocron monitoring check <url>` — runs every configured `monitoring`
 * check against an arbitrary URL instead of each check's own configured
 * one (holocron#1010).
 *
 * Built for CI: the `delivery.previewCheck` task runs this against a
 * PR's Vercel preview deployment, reusing the exact same check
 * definitions already in `holocron.config.ts` for production — no
 * vendor API call, no separate checks-as-code file to keep in sync.
 *
 * Split into two pieces (holocron#1030/#1032 review) so a caller that
 * needs to attach a credential to the request (e.g. Vercel's Deployment
 * Protection bypass header) can do so in a process that never loads a
 * PR's own `holocron.config.ts` at all:
 *   - {@link resolveMonitoringChecks} — loads config/plugins, returns the
 *     configured `MonitoringCheckInput[]`. Untrusted: this executes
 *     whatever code a PR's own config file contains. Never give this
 *     process a credential worth protecting.
 *   - {@link reportChecks} — takes an already-resolved check list (no
 *     config loading at all) and runs/report them against a URL. Safe
 *     to run with a credential present, since nothing here executes
 *     PR-authored code.
 * `runMonitoringCheck` composes both, unchanged, for every caller that
 * doesn't need the split (the plain CLI invocation, tests, anywhere a
 * credential isn't in play).
 */

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Monitoring,
	type MonitoringCheckInput,
	PluginLoader,
	runCheckAgainstUrl,
} from "../../plugin/index.js";
import type {
	ReportChecksInput,
	ResolveMonitoringChecksInput,
	RunMonitoringCheckInput,
} from "./monitoring-check.type.js";
import type { MonitoringCheckReport, MonitoringCheckSummary } from "./monitoring-check.type.js";

/**
 * Loads config/plugins and returns the configured `monitoring` checks —
 * the untrusted half of `monitoring check`. Executes a PR's own
 * `holocron.config.ts` (and whatever it imports); never run this with a
 * credential in the process environment that a malicious config could
 * read and exfiltrate.
 */
export async function resolveMonitoringChecks(input: ResolveMonitoringChecksInput): Promise<MonitoringCheckInput[]> {
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "monitoring check");

	// `get()` re-surfaces the monitoring provider's own load error (a bad
	// token, a constructor throw, …) when it was configured but failed to
	// load — never swallowed behind a generic "not configured" message,
	// which would send an operator chasing the wrong fix.
	const monitoring = loader.get("monitoring") as Monitoring;
	return [...monitoring.checks];
}

/**
 * Runs an already-resolved check list against `url` and reports
 * pass/fail — the trusted half of `monitoring check`. Takes plain data,
 * never touches `holocron.config.ts` or any plugin: safe to run with a
 * credential (in `headers` or elsewhere in the process env) present.
 */
export async function reportChecks(input: ReportChecksInput): Promise<MonitoringCheckReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const run = input.runCheck ?? runCheckAgainstUrl;

	print(`Holocron monitoring check — against ${input.url}`);

	if (input.checks.length === 0) {
		const message = "no monitoring checks configured — nothing to validate";
		print(`✗ ${message}`);
		logger.warn({ url: input.url }, "monitoring check: no checks configured");
		return { status: "fail", checks: [] };
	}

	const checks: MonitoringCheckSummary[] = [];
	for (const checkInput of input.checks) {
		const result = await run(checkInput, { url: input.url, ...(input.headers ? { headers: input.headers } : {}) });
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

/**
 * `resolveMonitoringChecks` + `reportChecks` in one call — the plain CLI
 * contract, unchanged. Only safe to run with a credential present when
 * the config being loaded is trusted (no PR in the loop); CI's
 * `delivery.previewCheck` uses the two halves separately instead.
 */
export async function runMonitoringCheck(input: RunMonitoringCheckInput): Promise<MonitoringCheckReport> {
	const checks = await resolveMonitoringChecks({
		loaded: input.loaded,
		context: input.context,
		loader: input.loader,
	});
	return reportChecks({
		checks,
		url: input.url,
		...(input.headers ? { headers: input.headers } : {}),
		...(input.print ? { print: input.print } : {}),
		...(input.logger ? { logger: input.logger } : {}),
		...(input.runCheck ? { runCheck: input.runCheck } : {}),
	});
}
