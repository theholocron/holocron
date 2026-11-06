import { moveMajorTag, type MoveMajorTagInput, type MoveMajorTagReport } from "@theholocron/kyber/git";

import { getLogger } from "../../observability/logger/index.js";

/**
 * Moves a version group's major tag (`ci-v1`) to its latest stable release (`ci-v1.4.0`) and force-pushes it, so a
 * caller that pins `ci-v1` follows the group without changing its workflow files. Immutable tags are never touched.
 * Run by the group's release (`publishCmd`) and by hand for a repair. The tag logic is kyber's `moveMajorTag`; this adds
 * the command-bound logger.
 */
export function runMoveTag(input: MoveMajorTagInput): Promise<MoveMajorTagReport> {
	return moveMajorTag({ ...input, logger: input.logger ?? getLogger() });
}
