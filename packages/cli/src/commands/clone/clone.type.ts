import type { Logger } from "@theholocron/observability/core";

export interface CloneTarget {
	org: string;
	/** Set only when the input was `org/repo` — clone just this one repo instead of the whole org. */
	repo?: string;
}

export interface GitHubRepo {
	name: string;
	full_name: string;
	clone_url: string;
	archived: boolean;
}

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { status: number | null };

/** How many of an org's repos are already cloned locally vs. would actually be new. */
export interface WholeOrgScope {
	total: number;
	alreadyCloned: number;
	toClone: number;
}

export interface RunCloneInput {
	org: string;
	/** Clone just this one repo instead of every repo in `org`. */
	repo?: string;
	/** Parent directory to clone into. Defaults to ~/Code/<org>. */
	dir?: string;
	token: string;
	dryRun?: boolean;
	fetch?: typeof globalThis.fetch;
	exec?: ExecFn;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/**
	 * Called once, before cloning, only in whole-org mode (never for a
	 * single `repo` clone, never when `dryRun` is set — nothing destructive
	 * happens either way). Return `false` to abort without cloning
	 * anything. Omit entirely to skip confirmation (e.g. a non-interactive
	 * caller that already passed `--all` deliberately).
	 */
	confirmWholeOrg?: (scope: WholeOrgScope) => Promise<boolean>;
	/**
	 * Called once at the end — for a single `repo` clone, with that repo's
	 * own directory; for a whole-org clone, with the surrounding `targetDir`
	 * that holds every repo. Only called when that path actually exists on
	 * disk: always true after a real run (cloned or skipped-because-already-
	 * there), but a dry run's "would clone" path for anything brand new
	 * never exists yet, so this naturally stays silent there.
	 *
	 * The second argument is true for a dry run that found something it
	 * would actually clone — a real run (or a menu-launched "proceed with
	 * the real run?" decision) may still follow, so a caller that only wants
	 * to ask once, at the true end of the road, can defer in that case.
	 * Omit `confirmOpen` entirely to skip — e.g. a non-interactive caller
	 * with nothing to open to.
	 */
	confirmOpen?: (path: string, moreToCome: boolean) => Promise<void>;
}

export interface CloneReport {
	status: "ok" | "fail" | "dry-run" | "aborted";
	cloned: number;
	skipped: number;
	failed: number;
	message?: string;
}
