import type { IssueFields } from "../../../plugin/index.js";

/** The flags of an issue command, checked: the capability's fields, the area labels and the board. */
export type PreparedIssueFields =
	| {
			ok: true;
			/** What goes to `Issues.create` / `Issues.update`. */
			fields: IssueFields;
			/** The `area:<name>` labels to add. */
			areaLabels: string[];
			/** The board to put the issue on, by declared name. */
			project?: string;
	  }
	| { ok: false; problems: string[] };
