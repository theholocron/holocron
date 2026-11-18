import { readFileSync } from "node:fs";

import { defaultRun } from "../../../utils/index.js";
import { writeMarker } from "../deploy-marker/index.js";
import type {
	DeployRecordFile,
	RecordDeploysDeps,
	RecordDeploysOptions,
	RecordDeploysReport,
} from "./record-deploys.type.js";

const defaultReadFile = (path: string): string | undefined => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
};

/**
 * The record phase of a release-time deploy (holocron#2330): tags and pushes the `deployed/<package>` marker for each
 * package the deploy phase listed in its record file, which holds only the ones whose deploy succeeded. It runs as its
 * own step so the write token is in this step's environment and not the app's deploy script's. A missing or empty
 * file is a skip (nothing deployed); a tag that cannot be written fails the step, loudly, naming the package.
 */
export function recordDeploys(
	{ cwd, file, token, print, dryRun }: RecordDeploysOptions,
	{ run = defaultRun, readFile = defaultReadFile }: RecordDeploysDeps = {}
): RecordDeploysReport {
	const text = readFile(file);
	let record: DeployRecordFile | undefined;
	try {
		record = text === undefined ? undefined : (JSON.parse(text) as DeployRecordFile);
	} catch {
		print(`✗ ${file} is not valid JSON; no deploy recorded.`);
		return { status: "fail", results: [] };
	}
	if (!record || record.deployed.length === 0) {
		print("No deploy to record.");
		return { status: "skip", results: [] };
	}
	if (!dryRun && !token) {
		print("✗ No token to push the deploy tags with (GITHUB_TOKEN).");
		return { status: "fail", results: [] };
	}

	const results: RecordDeploysReport["results"] = [];
	for (const { pkg, tag } of record.deployed) {
		if (dryRun) {
			results.push({ pkg, status: "dry-run", message: `would tag ${tag} at ${record.to}.` });
		} else {
			const problem = writeMarker(run, cwd, tag, record.to, token as string);
			results.push(
				problem
					? { pkg, status: "fail", message: `${problem}; the next release may deploy it again.` }
					: { pkg, status: "ok", message: `recorded ${tag}.` }
			);
		}
		const last = results[results.length - 1];
		print(`${last.status === "fail" ? "✗ " : ""}${pkg}: ${last.message}`);
	}
	return { status: results.some((r) => r.status === "fail") ? "fail" : "ok", results };
}
