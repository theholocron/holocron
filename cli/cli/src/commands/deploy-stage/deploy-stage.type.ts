import type { AlphaReleaseLookup } from "./alpha-release/index.js";

/** Input to {@link stageDeploy}. */
export interface StageDeployInput {
	/** The package to stage: holds `package.json`, `api/`, `dist/` and `vercel.json`. */
	packageDir: string;
	/** Where the payload goes. Default `<packageDir>/.vercel-deploy`. */
	outDir?: string;
	print?: (line: string) => void;
	/** Injectable for testing. */
	resolveVersion?: (packageDir: string, name: string) => string;
	/** The required peers of an installed dependency with their installed versions. Injectable for testing. */
	resolvePeers?: (packageDir: string, dependency: string) => Record<string, string>;
	/**
	 * The release npm's `alpha` tag points at for a package. An `@theholocron/*` dependency installed at an `alpha`
	 * prerelease is pinned to it. Injectable for testing; the default asks `npm view`.
	 */
	alphaRelease?: AlphaReleaseLookup;
}

/** What {@link stageDeploy} wrote. */
export interface StageDeployReport {
	status: "ok" | "fail";
	/** The directory holding the payload; set on `ok`. */
	outDir?: string;
	/** The pinned `dependencies` of the staged `package.json`; set on `ok`. */
	dependencies?: Record<string, string>;
	message?: string;
}
