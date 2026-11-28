import type { ProjectReport } from "../open-projects/index.js";

/** A counting printer for a subcommand's rows and its closing summary line. */
export interface ProjectRows {
	/** A step that worked. */
	ok(label: string, detail?: string): void;
	/** A step that failed. */
	fail(label: string, detail?: string): void;
	/** A step that was left alone. */
	skip(label: string, detail?: string): void;
	/** A plain line. */
	line(text: string): void;
	/** Print the summary and make the report. */
	finish(command: string): ProjectReport;
}
