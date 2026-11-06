import type { Logger } from "@theholocron/observability/core";

/** Runs `git` with `args` in `cwd` and returns its trimmed stdout; throws when git fails. */
export type RunGit = (args: readonly string[], cwd: string) => string;

/** What `moveMajorTag` needs, and the seams that stand in for the terminal, logging and `git`. */
export interface MoveMajorTagInput {
	/** The version group whose major tag moves: its tags are `<group>-v<version>`. */
	group: string;
	/** The stable release the major tag should point at (`1.4.0`). Defaults to the group's latest stable tag. */
	version?: string;
	/** Working directory (the repo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would move without tagging or pushing. */
	dryRun?: boolean;
	/** The remote to push to. Defaults to `origin`. */
	remote?: string;
	/** Where progress lines go. Defaults to `console.log`. */
	/** Where progress lines go. Defaults to `console.log`. */
	print?: (line: string) => void;
	/** Structured-logging sink, sibling of `print`. Nothing is logged without one. */
	logger?: Logger;
	/** Injectable for testing. Defaults to spawning `git`. */
	git?: RunGit;
}

/** How a run ended. */
export type MoveMajorTagStatus = "ok" | "fail" | "dry-run";

/** What `moveMajorTag` did. */
export interface MoveMajorTagReport {
	status: MoveMajorTagStatus;
	/** The moving major tag (`ci-v1`), when one was worked out. */
	tag?: string;
	/** The release tag it points at (`ci-v1.4.0`). */
	target?: string;
	message?: string;
}
