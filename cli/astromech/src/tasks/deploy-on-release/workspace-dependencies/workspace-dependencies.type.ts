export interface WorkspaceDependenciesOptions {
	/**
	 * Also traverse `workspace:*` `devDependencies`, not just `dependencies`
	 * (default `false`). A dev/build-time-only workspace package (a
	 * tsconfig, a lint config) can change what gets built, so a caller
	 * computing paths that should trigger a rebuild wants this on — but a
	 * caller waiting for npm to publish a package's runtime dependencies
	 * before deploying it does not: an unpublished (or `private`)
	 * dev-only package would never satisfy that wait (holocron#1071 review).
	 */
	includeDevDependencies?: boolean;
}
