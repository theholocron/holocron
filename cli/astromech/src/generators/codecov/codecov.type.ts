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

/** A workspace package as the `codecov.yml` generator sees it: the flag and component it gets, and where it lives. */
export interface WorkspacePackage {
	/** The package's folder name, used as its Codecov flag and component id. */
	slug: string;
	/** The package's npm name. */
	name: string;
	/** The workspace root the package was discovered under (`packages`, `apps`, `clients`, ...). Defaults to `"packages"`. */
	dir?: string;
	/**
	 * Repo-relative directory, set when it is not `<dir>/<slug>` -- a package that
	 * is itself a workspace folder (`observability`) or sits deeper (`docs/theme`).
	 */
	path?: string;
}
