/** The `package.json` fields these utils and their callers read; any other field passes through untyped. */
export interface PackageJson {
	name?: string;
	version?: string;
	private?: boolean;
	packageManager?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	[field: string]: unknown;
}
