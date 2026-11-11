import type { BoardSummary } from "../../../plugin/index.js";
import type { ProjectReport, ProjectRunInput } from "../open-projects/index.js";

/** Input for {@link runProjectCreate}. */
export interface RunProjectCreateInput extends ProjectRunInput {
	/** The template's name. Asked for in a terminal when absent. */
	template?: string | undefined;
	/** The board's title. Defaults to the template's name. */
	title?: string | undefined;
	/** When an open board of that title exists, print its address instead of asking. */
	yes?: boolean | undefined;
}

/** What `holocron new project` did. */
export interface ProjectCreateReport extends ProjectReport {
	/** The board made, or the one that already had the title. */
	board?: BoardSummary;
	/** Whether a board was made by this run. */
	created: boolean;
}
