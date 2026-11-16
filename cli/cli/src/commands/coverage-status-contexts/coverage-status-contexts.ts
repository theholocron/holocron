import type { Coverage, CoverageStatusContext } from "../../plugin/capabilities/index.js";
import { coverageExpectations } from "../coverage-expectations/index.js";
import type { CoverageStatusContextsInput } from "./coverage-status-contexts.type.js";

/**
 * The commit statuses the repo's `coverage` provider posts (`Coverage.statusContexts()`), for the generators that decide
 * which statuses the `ci` aggregate and the ruleset wait on. The task runner imports no provider, so this is where the
 * contexts are read and handed in. `undefined` when no `coverage` provider is loaded or it does not implement the method,
 * which leaves the task runner's default in force. Names only: it reads the workspace's package names and the docs mode.
 */
export function coverageStatusContexts(input: CoverageStatusContextsInput): CoverageStatusContext[] | undefined {
	if (!input.loader.has("coverage")) return undefined;
	const provider = input.loader.get("coverage") as Coverage;
	if (provider.statusContexts === undefined) return undefined;
	const documentation = input.docsCoverage ?? "off";
	return provider.statusContexts({
		components: coverageExpectations(input.repoRoot, documentation).components,
		documentation,
	});
}
