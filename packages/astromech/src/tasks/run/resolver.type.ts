export interface ResolverDeps {
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
}

export interface ToolConfigSpec {
	/** `@theholocron/*-config` package name. */
	package: string;
	/** `package.json#exports` subpath key — `"."` or `"./bundles/library"`. */
	exportPath: string;
	/** Flag(s) to prepend before the resolved path, e.g. `["--config"]`. */
	flag: string[];
}
