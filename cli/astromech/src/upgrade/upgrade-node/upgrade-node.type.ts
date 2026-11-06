/** One kind of file that pins the Node.js major. */
export interface NodePinPattern {
	/** True when this pattern applies to the file's basename. */
	matches: (filename: string) => boolean;
	/** The new content, or `null` when nothing in the file changed. */
	patch: (content: string, from: number, to: number) => string | null;
}

/** Structured-logging sink for `runUpgradeNode`; any pino-style logger fits. */
export interface UpgradeNodeLogger {
	debug(obj: Record<string, unknown>, msg?: string): void;
	info(obj: Record<string, unknown>, msg?: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
}

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
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to a no-op. */
	logger?: UpgradeNodeLogger;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	walkFiles?: (dir: string) => string[];
}

export type UpgradeNodeStatus = "ok" | "fail" | "dry-run";

export interface UpgradeNodeReport {
	status: UpgradeNodeStatus;
	updated: readonly string[];
	message?: string;
}
