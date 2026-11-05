import type { ProjectReport, ProjectRunInput } from "../open-projects/index.js";

/** Input for {@link runProjectClose}. */
export interface RunProjectCloseInput extends ProjectRunInput {
	/** The board's number (`7`) or name. */
	board: string;
	/** Close without asking. */
	yes?: boolean | undefined;
}

/** What `holocron project close` did. */
export interface ProjectCloseReport extends ProjectReport {
	/** Whether the board was closed by this run. */
	closed: boolean;
}
