import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createHeader, localizeActions } from "@theholocron/astromech";

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
 * The composite actions the hosting repo's own copy of a reusable runs from its checkout, not from the frozen copy in
 * `theholocron/.github` that the shared text names. The upload loop is here so a retry added to it takes effect on the
 * PR that adds it; the frozen copy never changes again. Other actions join once `CI_HOME` moves to `ci-v1` and the
 * rest of the hosted files are run from this repo.
 */
const LOCAL_ACTIONS = ["codecov-upload"] as const;

/**
 * The text of a reusable workflow written to the hosting repo's own `.github/workflows`: the AUTO-GENERATED header,
 * the `# Source package:` marker `generated check` reads, and the workflow itself with {@link LOCAL_ACTIONS} run from
 * this checkout. Its source is `ci/workflows/<suite>/<leaf>.yml` (or `ci/workflows/<id>.yml`), the id with each colon
 * a folder.
 */
export function hostedReusableFile(id: string, content: string): string {
	const { workflowHeader } = createHeader({
		source: `ci/workflows/${id.replaceAll(":", "/")}.yml`,
		tool: "holocron sync",
	});
	return `${workflowHeader()}# Source package: .\n\n${localizeActions(content, LOCAL_ACTIONS)}`;
}
