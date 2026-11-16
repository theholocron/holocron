import type { Coverage, CoverageExpectations } from "@theholocron/cli";

/** What the `repo` probe reads from the plugin. */
export interface RepoProbeContext {
	/** The `coverage` capability, built with the plugin's tokens. */
	coverage: () => Coverage;
	/** The flags and components the workspace's config declares. Throws when the workspace cannot be read. */
	expected: () => CoverageExpectations;
	/** `owner/repo` the probe asks about, or `undefined` when the plugin options name no repository. */
	repo: string | undefined;
}
