import { existsSync } from "node:fs";
import { join } from "node:path";

/** The release caller's filename: the current name first, then the one a repo still on the older callers has. */
const CANDIDATES = ["ci.release.yml", "delivery.publish.yml"] as const;

/**
 * The workflow file to register as an npm Trusted Publisher: the release caller in the repo's `.github/workflows`. npm
 * checks the _calling_ workflow's filename, so this is the caller (`ci.release.yml`), not the reusable `release.yml` it
 * calls. A repo with neither file gets the current name.
 */
export function releaseWorkflowFile(cwd: string): string {
	return CANDIDATES.find((file) => existsSync(join(cwd, ".github", "workflows", file))) ?? CANDIDATES[0];
}
