import { classifySpecPath } from "@theholocron/astromech/repo-validation";

import type { SpecOrigin } from "./specs-sync.type.js";

/** How many ADRs and specs one commit may add before it counts as a bulk change (an import, a move) and names no pull request. */
export const BULK_DOCUMENTS = 3;

/**
 * The origin of a document from the commit that first added it: `line` is that commit's `<seconds>\t<subject>` and
 * `addedPaths` every file the commit added. The pull request is the one the subject names (`(#1538)`), unless the commit
 * added more than `BULK_DOCUMENTS` ADRs and specs: then the pull request is the bulk one, not the document's own, so none
 * is named. `undefined` when there is no commit.
 */
export function originFromCommit(line: string | undefined, addedPaths: string[]): SpecOrigin | undefined {
	if (!line) return undefined;
	const [at = "", subject = ""] = line.split("\t");
	const bulk = addedPaths.filter((path) => classifySpecPath(path)).length > BULK_DOCUMENTS;
	const pr = bulk ? undefined : /\(#(\d+)\)\s*$/.exec(subject)?.[1];
	return { time: Number(at), ...(pr ? { pr: Number(pr) } : {}) };
}
