/** The `package.json` fields these utils and their callers read; any other field passes through untyped. */
export interface PackageJson {
	/** The package name. */
	name?: string;
	/** The package version. */
	version?: string;
	/** Whether the package is private and so never published. */
	private?: boolean;
	/** The package manager and version the project declares, such as `pnpm@10.0.0`. */
	packageManager?: string;
	/** Script names mapped to their commands. */
	scripts?: Record<string, string>;
	/** Runtime dependencies, name to range. */
	dependencies?: Record<string, string>;
	/** Development dependencies, name to range. */
	devDependencies?: Record<string, string>;
	/** Packages the consumer is expected to provide. */
	peerDependencies?: Record<string, string>;
	/** Dependencies that are installed when possible but may fail to install. */
	optionalDependencies?: Record<string, string>;
	[field: string]: unknown;
}
