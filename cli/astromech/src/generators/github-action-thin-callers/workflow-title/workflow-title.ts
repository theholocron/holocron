/** Words of a task id that are written in capitals, not title case. */
const ACRONYMS: Record<string, string> = { ci: "CI", dco: "DCO" };

/**
 * The title a task's runs carry in a run list: the id's words in title case (`deploy-sentinel` is `Deploy Sentinel`,
 * `test:unit` is `Test Unit`, `ci` is `CI`). Only the run title uses it; the workflow, job and check names stay the id.
 */
export function workflowTitle(id: string): string {
	return id
		.split(/[:-]/)
		.filter(Boolean)
		.map((word) => ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
