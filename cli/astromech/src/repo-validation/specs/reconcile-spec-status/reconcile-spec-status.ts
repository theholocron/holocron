import { WITHDRAWN_STATE } from "../spec-locations/spec-locations.js";
import type { StatusReconciliation, StatusTriple } from "../specs.type.js";

/**
 * What to do about a spec's status when the file, the tag on its discussion post and the status last synced may all
 * differ. Two values cannot tell "someone retagged" from "the file changed and the tag has not caught up"; the third,
 * the status the post was last in step with, can.
 *
 * - in step (tag is the file's status): nothing, or just record it when the post's last-synced line is stale
 * - the tag is missing (none, or more than one status tag): put the file's status on it
 * - only the file moved since the last sync (a merged edit): set the tag to the file's status
 * - only the tag moved (a gatekeeper retagged): ask for the file to change, through a pull request
 * - both moved, or there is no last-synced status to tell by: report a conflict and change nothing
 *
 * - the tag is `withdrawn` (the post's pull request closed unmerged, #1653): never a retag, since no file has that status.
 *   The file's status goes back on the tag, which is what reopening the pull request, or the same file coming back in a
 *   new one, needs.
 *
 * A file with no `status` cannot be synced, so that is a conflict too.
 */
export function reconcileSpecStatus({ file, tag, synced }: StatusTriple): StatusReconciliation {
	if (file === undefined) return { action: "conflict", reason: "the file has no status to sync" };
	if (tag === file) return synced === file ? { action: "none" } : { action: "record", status: file };
	if (tag === undefined || tag === WITHDRAWN_STATE) return { action: "set-tag", status: file };
	if (synced === undefined) {
		return {
			action: "conflict",
			reason: `the file says ${file} and the tag says ${tag}, and nothing says which moved`,
		};
	}
	if (synced === file) return { action: "request", status: tag };
	if (synced === tag) return { action: "set-tag", status: file };
	return {
		action: "conflict",
		reason: `the file moved to ${file} and the tag to ${tag} since they last agreed on ${synced}`,
	};
}
