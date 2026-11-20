import type { IssueFields } from "../../../plugin/index.js";

/** The flags of an issue command, checked and ready to send. */
export interface PreparedIssueFieldsOk {
	ok: true;
	/** What goes to `Issues.create` / `Issues.update`. */
	fields: IssueFields;
	/** The `area:<name>` labels to add. */
	areaLabels: string[];
	/** The board to put the issue on, by declared name. */
	project?: string;
}

/** The flags of an issue command that cannot be sent, with what is wrong. */
export interface PreparedIssueFieldsFailed {
	ok: false;
	problems: string[];
}

/** The flags of an issue command, checked: the capability's fields, the area labels and the board. */
export type PreparedIssueFields = PreparedIssueFieldsOk | PreparedIssueFieldsFailed;
