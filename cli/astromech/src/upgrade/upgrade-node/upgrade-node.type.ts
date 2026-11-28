/** One kind of file that pins the Node.js major. */
export interface NodePinPattern {
	/** True when this pattern applies to the file's basename. */
	matches: (filename: string) => boolean;
	/** The new content, or `null` when nothing in the file changed. */
	patch: (content: string, from: number, to: number) => string | null;
}

/** Structured-logging sink for `runUpgradeNode`; any pino-style logger fits. */
export interface UpgradeNodeLogger {
	/** Records a per-file debug line. */
	debug(obj: Record<string, unknown>, msg?: string): void;
	/** Records the start and the outcome of a run. */
	info(obj: Record<string, unknown>, msg?: string): void;
	/** Records a run that could not proceed. */
	warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Input to `runUpgradeNode`. */
export interface RunUpgradeNodeInput {
	/** Target Node.js major version (e.g., 22). */
	to: number;
	/** Source major version. Auto-detected from .nvmrc / engines.node when omitted. */
	from?: number;
	/** Working directory (repo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would change without writing anything. */
	dryRun?: boolean;
	/**
	 * Extra file paths (relative to cwd) to scan in addition to the normal walk. Use for non-conventional
	 * locations not covered by the pattern registry (e.g., a `.tool-versions` in a subdirectory).
	 */
	extra?: string[];
	/** Writes one line of progress output. Defaults to `console.log`. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to a no-op. */
	logger?: UpgradeNodeLogger;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	/** Injectable for testing. */
	writeFile?: (path: string, content: string) => void;
	/** Injectable for testing; lists every file under `dir`, skipping build and VCS folders by default. */
	walkFiles?: (dir: string) => string[];
}

/** How a run ended: files written, nothing written because of `dryRun`, or a failure. */
export type UpgradeNodeStatus = "ok" | "fail" | "dry-run";

/** What `runUpgradeNode` did. */
export interface UpgradeNodeReport {
	/** How the run ended. */
	status: UpgradeNodeStatus;
	/** Repo-relative paths that were (or, in dry-run, would be) patched. */
	updated: readonly string[];
	/** Why the run failed; set only when `status` is `"fail"`. */
	message?: string;
}
