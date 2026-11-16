import type { DocsCoverageMode } from "@theholocron/astromech";
import { codecovFlagNames, DOCUMENTATION_FLAG, readWorkspacePackages } from "@theholocron/astromech";

import type { CoverageExpectations } from "../../plugin/capabilities/index.js";

/**
 * The flags and components `holocron sync` writes to `codecov.yml` for the workspace at `repoRoot`: the same
 * functions the generator uses, so a coverage provider's `checkRepo()` compares with exactly what is written. A flag per
 * package (none for `docs`), plus `documentation` when `docsCoverage` is `warn` or `required`; a component per package.
 * Both lists are sorted. Plugins call this instead of importing the task runner.
 */
export function coverageExpectations(repoRoot: string, docsCoverage: DocsCoverageMode = "off"): CoverageExpectations {
	const packages = readWorkspacePackages(repoRoot);
	const flags = codecovFlagNames(packages);
	if (docsCoverage !== "off") flags.push(DOCUMENTATION_FLAG);
	return {
		flags: [...new Set(flags)].sort(),
		components: packages.map((pkg) => pkg.slug).sort(),
	};
}
