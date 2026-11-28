import type { Coverage, CoverageExpectations } from "@theholocron/cli";

/** What the `repo` probe reads from the plugin. */
export interface RepoProbeContext {
	/**
	 * The `coverage` capability. Given an API token (the one `--environment` handed over for `HOLOCRON_CODECOV_API_TOKEN`) it
	 * is built with that token; without one, with the plugin's own resolution of the API token (shell, keyring).
	 */
	coverage: (apiToken?: string) => Coverage;
	/** The variable the API token is declared under, which `--token-name` carries when `--environment` hands that token over. */
	apiTokenName: string;
	/**
	 * What the CLI handed the plugin as its token (`--token`, or a token the `--environment` run chose). With no
	 * `--token-name` it is the upload token and the probe does not use it; with the API token's name it is that token.
	 */
	cliToken: string | undefined;
	/** The flags and components the workspace's config declares. Throws when the workspace cannot be read. */
	expected: () => CoverageExpectations;
	/** `owner/repo` the probe asks about, or `undefined` when the plugin options name no repository. */
	repo: string | undefined;
}
