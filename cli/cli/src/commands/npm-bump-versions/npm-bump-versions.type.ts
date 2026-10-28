import type { Logger } from "@theholocron/observability/core";

export interface RunNpmBumpVersionsInput {
	/** Next version string (e.g., "4.2.0" or "2.0.0-alpha.1"). */
	version: string;
	/** Working directory (monorepo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would change without writing anything. */
	dryRun?: boolean;
	/**
	 * Bump only this version group: a folder of the repo (`clients`, `observability`).
	 * The root `package.json` is left alone. Omitted, the root and every workspace package.
	 */
	group?: string;
	/**
	 * Leave these version groups alone. The root and every other workspace package still move
	 * together; a group released on its own keeps its own version.
	 */
	excludeGroups?: readonly string[];
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	listDir?: (path: string) => string[];
	isDir?: (path: string) => boolean;
}

export type BumpVersionsStatus = "ok" | "fail" | "dry-run";

export interface NpmBumpVersionsReport {
	status: BumpVersionsStatus;
	bumped: readonly string[];
	skipped: readonly string[];
	message?: string;
}
