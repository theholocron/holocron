/**
 * `holocron doctor repo` — do the repository settings `repo setup` writes match the config?
 *
 * Read-only. One row per group `repo setup` manages through the `source` capability, each only when the config
 * declares it: description and homepage, default branch and merge settings, topics, custom properties, labels, team
 * access, branch protection and security settings (see {@link repoChecks}). Something that exists but is not declared
 * is a problem only where `repo setup` would remove it (topics, stale labels, a ruleset's rules). A group that cannot
 * be read because there is no provider, the provider lacks the read method or the token is missing is a skip with the
 * reason, not a failure. Variables, secrets and environments have their own checks.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Source } from "../../plugin/index.js";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "../doctor-checks/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import type { DoctorRepoReport, RepoCheck, RepoCheckResult, RunDoctorRepoInput } from "./doctor-repo.type.js";
import { repoChecks } from "./repo-checks.js";

export async function runDoctorRepo(input: RunDoctorRepoInput): Promise<DoctorRepoReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor repo");

	const checks = repoChecks(input.loaded.resolved, input.context.repoRoot);
	const rows: CheckRow[] = [];
	if (!loader.has("source")) {
		const why = whyMissing(loader, "source", "no `source` provider to read the repository with");
		for (const check of checks) rows.push(row(check, { skip: why }));
	} else {
		const source = loader.get("source") as Source;
		for (const check of checks) {
			if (typeof source[check.needs] !== "function") {
				rows.push(row(check, { skip: `provider does not implement ${check.needs}` }));
				continue;
			}
			try {
				rows.push(row(check, await check.run(source)));
			} catch (err) {
				const noToken = missingTokenReason(err);
				if (noToken !== undefined) rows.push(row(check, { skip: noToken }));
				else
					rows.push({
						id: check.id,
						title: check.title,
						status: "fail",
						detail: errorMessage(err),
						problems: [],
					});
			}
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor repo");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}

function row(check: RepoCheck, result: RepoCheckResult): CheckRow {
	const { id, title } = check;
	if ("skip" in result) return { id, title, status: "skip", detail: result.skip, problems: [] };
	if (result.problems.length > 0) {
		return { id, title, status: "fail", detail: `${result.problems.length} problem(s)`, problems: result.problems };
	}
	return { id, title, status: "ok", detail: `${result.checked} of ${result.checked} match`, problems: [] };
}
