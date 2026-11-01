import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createHeader } from "@theholocron/astromech";

/** The name of the private package that holds the reusable workflows and composite actions. */
const CI_PACKAGE = "@theholocron/ci";

/** What holocron's own callers are called, so they do not clash with the reusables they call. */
export const HOSTED_CALLER_PREFIX = "ci.";

/**
 * Whether the repo at `gitRoot` hosts the org's reusable workflows: it has the `@theholocron/ci` package in `ci/`.
 * Such a repo keeps the reusables in its own `.github/workflows` and calls them from there, at the caller's own
 * commit; every other repo calls them by reference.
 */
export function hostsReusables(gitRoot: string): boolean {
	try {
		const manifest = JSON.parse(readFileSync(join(gitRoot, "ci", "package.json"), "utf8")) as { name?: unknown };
		return manifest.name === CI_PACKAGE;
	} catch {
		return false;
	}
}

/**
 * The text of a reusable workflow written to the hosting repo's own `.github/workflows`: the AUTO-GENERATED header,
 * the `# Source package:` marker `generated check` reads, and the workflow itself. Its source is `ci/workflows/`.
 */
export function hostedReusableFile(name: string, content: string): string {
	const { workflowHeader } = createHeader({ source: `ci/workflows/${name}.yml`, tool: "holocron repo sync" });
	return `${workflowHeader()}# Source package: .\n\n${content}`;
}
