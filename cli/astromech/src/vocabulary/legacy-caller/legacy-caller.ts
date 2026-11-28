import { LEGACY_CALLERS } from "../legacy-callers/index.js";

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The thin caller `yaml` of task `id` spelled with the names it had before they became the task id: the old workflow
 * `name:` and the old id and `name:` of each job. This is the legacy-name gate (spec `ci-flat-task-vocabulary`, phase
 * F): a repo whose callers still call the frozen reusables in `theholocron/.github` keeps the checks its ruleset lists,
 * so only the repo that hosts the reusables (and, later, every repo once `CI_HOME` is `ci-v1`) gets the flat names.
 * An id with no old spelling is returned as it is. Only a job `name:` that is the id is rewritten, so a name a caller
 * builds itself (the grouped release's matrix name) is left to the entry's `replace`.
 */
export function legacyCaller(id: string, yaml: string): string {
	const legacy = LEGACY_CALLERS[id];
	if (legacy === undefined) return yaml;

	const combined = legacy.combinedName !== undefined && /^ {2}[\w-]+-preview:\s*$/m.test(yaml);
	let out = yaml.replace(/^name:.*$/m, `name: ${combined ? legacy.combinedName : legacy.name}`);
	for (const [from, to] of Object.entries(legacy.replace ?? {})) out = out.replaceAll(from, to);

	const flatName = new RegExp(`^ {4}name: ${escaped(id)}[^\\S\\n]*\\n`, "m");
	for (const [flat, job] of Object.entries(legacy.jobs)) {
		const block = new RegExp(`^ {2}${escaped(flat)}:[^\\S\\n]*\\n((?: {4}[^\\n]*\\n|\\n)*)`, "m");
		out = out.replace(block, (_all, rest: string) => {
			const body = rest.replace(flatName, job.name === undefined ? "" : `    name: ${job.name}\n`);
			return `  ${job.id}:\n${body}`;
		});
	}
	return out;
}
