/**
 * `holocron monitoring resolve-checks` — loads config/plugins and writes
 * the configured `monitoring` checks to a file as JSON (holocron#1030/
 * #1032 review).
 *
 * The untrusted half of the `delivery.previewCheck` split: this process
 * executes a PR's own `holocron.config.ts`, so it must never run with a
 * credential worth protecting (e.g. a Deployment Protection bypass
 * secret) present in its environment. `monitoring run-resolved` is the
 * trusted half — it reads this command's output file and performs the
 * actual authenticated request, with no config loading at all.
 */

import { writeFile } from "node:fs/promises";

import { resolveMonitoringChecks } from "../monitoring-check/index.js";
import type { RunMonitoringResolveChecksInput } from "./monitoring-resolve-checks.type.js";

export async function runMonitoringResolveChecks(input: RunMonitoringResolveChecksInput): Promise<void> {
	const print = input.print ?? ((line: string) => console.log(line));
	const checks = await resolveMonitoringChecks({
		loaded: input.loaded,
		context: input.context,
		loader: input.loader,
	});
	await writeFile(input.outFile, JSON.stringify(checks), "utf8");
	print(`Resolved ${checks.length} monitoring check(s) → ${input.outFile}`);
}
