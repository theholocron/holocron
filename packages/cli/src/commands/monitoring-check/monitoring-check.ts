import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Monitoring, PluginLoader, runCheckAgainstUrl } from "../../plugin/index.js";
import type {
	MonitoringCheckReport,
	MonitoringCheckSummary,
	RunMonitoringCheckInput,
} from "./monitoring-check.type.js";

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
