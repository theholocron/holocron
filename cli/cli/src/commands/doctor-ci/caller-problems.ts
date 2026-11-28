import { KNOWN_WORKFLOWS, LEGACY_NAMES, workflowFile, workflowKeys } from "@theholocron/astromech";

import type { ParsedCaller } from "./doctor-ci.type.js";

/** The ids that have a caller: every template's, and the three that are generated without one. */
const CALLER_IDS = [...KNOWN_WORKFLOWS, "deploy-docs", "deploy-components", "ci"];

/** The `ci.` a hosting repo puts before its callers' file names (`ci.yml` is the reusable itself, not a prefixed caller). */
const PREFIX = "ci.";

/**
 * What is wrong with the names of the generated callers, one line each. A caller is named for its task id in three
 * places: the file (`workflowFile(id)`, `ci.` first in the repo that hosts the reusables), the workflow `name:` and each
 * job's `name:` (a job may add a suffix after a space: `release ${{ matrix.group }}`). A file still named for an old
 * task (`ci.verification.unitTests.yml`) is reported once, with the flat file or files that replace it; its workflow and
 * job names are old too and are not listed again. A caller that is not for a known task is left alone.
 */
export function callerProblems(callers: readonly ParsedCaller[]): string[] {
	return callers.flatMap(({ file, name, jobs }) => {
		const base = file.replace(/\.yml$/, "");
		const prefix = base.startsWith(PREFIX) ? PREFIX : "";
		const stem = base.slice(prefix.length);
		const oldFiles = Object.hasOwn(LEGACY_NAMES, stem)
			? workflowKeys(stem).map((id) => `${prefix}${workflowFile(id)}`)
			: [];
		// An old hyphen id whose flat file is the same (`measure-docs` is also the file of `measure:docs`) is not an old name.
		if (oldFiles.length > 0 && !(oldFiles.length === 1 && oldFiles[0] === file)) {
			return [`${file}: an old caller name; the flat name is ${oldFiles.join(", ")}`];
		}
		const id = CALLER_IDS.find((candidate) => workflowFile(candidate).replace(/\.yml$/, "") === stem);
		if (id === undefined) return [];
		const problems: string[] = [];
		if (name !== id) problems.push(`${file}: workflow name ${JSON.stringify(name ?? "")}, expected ${id}`);
		for (const job of jobs) {
			const jobName = job.name ?? "";
			if (jobName !== id && !jobName.startsWith(`${id} `)) {
				problems.push(`${file}: job ${job.id} is named ${JSON.stringify(jobName)}, expected ${id}`);
			}
		}
		return problems;
	});
}
