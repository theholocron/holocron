import type { ProjectReport, ProjectRunInput } from "../open-projects/index.js";

/** Input for {@link runProjectStatus}. */
export interface RunProjectStatusInput extends ProjectRunInput {
	/** The issue's key: `#1234`, `1234`, `owner/repo#1234`, or the tracker's own key. */
	issue: string;
	/** The status's name in the board's template, in any case. */
	status: string;
	/** The declared board's name. Defaults to the first one declared. */
	board?: string | undefined;
}

/** What `holocron project status` did. */
export interface ProjectStatusReport extends ProjectReport {
	/** The item's key as the board holds it, when it was found. */
	key?: string;
	/** The status the item had, when it had one. */
	from?: string;
	/** The status the item has now (or would have, on a dry run). */
	to?: string;
}
