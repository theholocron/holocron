import type { CoverageStatusContext, CoverageStatusInput } from "@theholocron/cli";

/** The flag whose statuses are the doc-comment gate (`repoValidation.docsCoverage`); the name `codecov.yml` gives it. */
const DOCUMENTATION = "documentation";

/**
 * The commit statuses Codecov posts for a repository, by name, sorted. `codecov/project` and `codecov/patch` count the
 * tests and are required. Each component posts an informational `codecov/patch/<component>`. With the documentation
 * flag on (`warn` or `required`), `codecov/patch/documentation` and `codecov/project/documentation` exist, and only the
 * patch one gates, and only when the mode is `required`. Pure: no read of the config or of Codecov.
 */
export function statusContexts(input: CoverageStatusInput): CoverageStatusContext[] {
	const contexts: CoverageStatusContext[] = [
		{ name: "codecov/patch", required: true },
		{ name: "codecov/project", required: true },
		...[...new Set(input.components)].map((component) => ({ name: `codecov/patch/${component}`, required: false })),
	];
	if (input.documentation !== "off") {
		contexts.push(
			{ name: `codecov/patch/${DOCUMENTATION}`, required: input.documentation === "required" },
			{ name: `codecov/project/${DOCUMENTATION}`, required: false }
		);
	}
	const byName = new Map(contexts.map((context) => [context.name, context]));
	return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}
