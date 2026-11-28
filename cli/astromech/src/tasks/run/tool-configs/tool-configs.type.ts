export interface ToolConfigSpec {
	/** `@theholocron/*-config` package name. */
	package: string;
	/** `package.json#exports` subpath key — `"."` or `"./bundles/library"`. */
	exportPath: string;
	/** Flag(s) to prepend before the resolved path, e.g. `["--config"]`. */
	flag: string[];
}
