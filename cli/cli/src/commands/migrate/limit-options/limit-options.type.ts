import type { IssueOrder } from "../../../plugin/index.js";

/** The flags {@link limitOptions} declares, as yargs hands them over. */
export interface LimitArgs {
	/** `--limit`, still text: `parseLimit` reads it. */
	limit?: string;
	/** `--order`; `oldest` when not given. */
	order?: IssueOrder;
}
