/**
 * How strictly a repo enforces doc-comment coverage of its public API (`repoValidation.docsCoverage`, spec
 * `tech-api-docs`): `off` (the default) does nothing, `warn` reports without failing and posts informational Codecov
 * statuses, `required` fails the check and posts statuses that are not informational.
 */
export type DocsCoverageMode = "off" | "warn" | "required";

/** Per-repo choices that change what the `codecov.yml` generator writes. */
export interface CodecovConfigOptions {
	/** Adds the `documentation` flag and its statuses to `codecov.yml`. Default `off`: nothing is added. */
	docsCoverage?: DocsCoverageMode;
}

export interface WorkspacePackage {
	slug: string;
	name: string;
	/** The workspace root the package was discovered under (`packages`, `apps`, `clients`, ...). Defaults to `"packages"`. */
	dir?: string;
	/**
	 * Repo-relative directory, set when it is not `<dir>/<slug>` -- a package that
	 * is itself a workspace folder (`observability`) or sits deeper (`docs/theme`).
	 */
	path?: string;
}
