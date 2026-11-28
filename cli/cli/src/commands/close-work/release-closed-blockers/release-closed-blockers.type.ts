import type { Issues } from "../../../plugin/index.js";
import type { IssueUpdateReport } from "../../issue-update/run-issue-update/index.js";

/** What {@link releaseClosedBlockers} needs. */
export interface ReleaseClosedBlockersInput {
	/** The `issues` provider; it must be able to export, which is how blockers are read. */
	issues: Issues;
	/** The issue whose blockers are read. */
	key: string;
	/** Takes the given blockers off the issue (`update issue --unblock`). */
	unblock: (keys: string[]) => Promise<IssueUpdateReport>;
}
