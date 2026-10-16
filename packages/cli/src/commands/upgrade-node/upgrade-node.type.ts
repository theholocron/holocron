import type { Logger } from "@theholocron/observability/core";

export interface Pattern {
	matches: (filename: string) => boolean;
	patch: (content: string, from: number, to: number) => string | null;
}

// ── public API ────────────────────────────────────────────────────────────────

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
	 * Extra file paths (relative to cwd) to scan in addition to the normal
	 * walk. Use for non-conventional locations not covered by the pattern
	 * registry (e.g., custom Dockerfiles, .tool-versions in a subdirectory).
	 * Sourced from `upgrade.node.extra` in holocron.config.json.
	 */
	extra?: string[];
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
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
