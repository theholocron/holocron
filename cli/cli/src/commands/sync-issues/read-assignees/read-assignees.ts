import { errorMessage } from "@theholocron/misc-utils";

import type { Source } from "../../../plugin/index.js";
import { assigneesLocation } from "../assignees-location/index.js";
import { type AssigneeLink, parseAssignees } from "../parse-assignees/index.js";

/**
 * Reads the assignees file through the `source` provider. A file that does not exist, or a source that cannot read
 * files, is an empty map; a damaged file throws with its location.
 */
export async function readAssignees(source: Source | undefined, org: string | undefined): Promise<AssigneeLink[]> {
	if (!source?.readFile) return [];
	const { repo, path } = assigneesLocation(org);
	const file = await source.readFile(path, repo);
	if (!file) return [];
	try {
		return parseAssignees(file.content).links;
	} catch (err) {
		throw new Error(`${repo}/${path}: ${errorMessage(err)}`, { cause: err });
	}
}
