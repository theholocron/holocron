import type { TasksConfig } from "../../config/schema/index.js";
import type { Run } from "../../utils/index.js";
import type { Tree } from "./workspace-packages/index.js";

/** What `deployOnRelease` needs to know about a release. */
export interface DeployOnReleaseOptions {
	/** Repo root. */
	cwd: string;
	/** The release's channel: its prerelease identifier (`alpha`); empty or `main` for a stable release. */
	channel: string;
	/** The previous release's commit; omitted when there is none, so every deploying channel match deploys. */
	from?: string;
	/** The release commit. Default `HEAD`. */
	to?: string;
	/** Where progress lines go (stdout in the CLI). */
	print: (line: string) => void;
	/** Print what would deploy without running it. */
	dryRun?: boolean;
}

export interface DeployOnReleaseDeps extends Partial<Tree> {
	run?: Run;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Reads a package folder's task manifest; `loadTasksConfig` by default. */
	loadTasks?: (dir: string) => Promise<TasksConfig>;
}

/** The outcome of deploying one workspace package. */
export interface DeployOnReleaseResult {
	/** The package's name. */
	pkg: string;
	/** `ok`, `fail`, `skip` (the package does not deploy on this release) or `dry-run`. */
	status: "ok" | "fail" | "skip" | "dry-run";
	/** A one-line account of what happened. */
	message: string;
}

/** The outcome of a release-time deploy across the workspace. */
export interface DeployOnReleaseReport {
	/** `fail` if any package's deploy failed; `skip` if none applied to this release; else `ok`. */
	status: "ok" | "fail" | "skip";
	/** One entry per package considered for this release. */
	results: DeployOnReleaseResult[];
}
