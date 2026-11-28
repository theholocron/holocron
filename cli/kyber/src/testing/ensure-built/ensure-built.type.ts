/** What {@link ensureBuilt} needs to decide whether a build is current. */
export interface EnsureBuiltOptions {
	/** The built file the tests run, e.g. `dist/cli.mjs`. */
	bin: string;
	/** The source directory it is built from. A build older than any source file in it is stale. */
	srcDir: string;
	/** The package directory the build runs in. */
	cwd: string;
	/** Folders under `srcDir` whose files do not count as source (test helpers). Default `["testing"]`. */
	ignoreDirs?: string[];
	/** How to build. Default: run the package's own `tsdown`. */
	build?: () => void;
}
