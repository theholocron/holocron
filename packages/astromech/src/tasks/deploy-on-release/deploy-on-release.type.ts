import type { TasksConfig } from "../../config/schema/index.js";
import type { Run } from "../../utils/index.js";
import type { Tree } from "./workspace-packages/index.js";

export interface DeployOnReleaseOptions {
	cwd: string;
	/** The release's channel: its prerelease identifier (`alpha`); empty or `main` for a stable release. */
	channel: string;
	/** The previous release's commit; omitted when there is none, so every deploying channel match deploys. */
	from?: string;
	/** The release commit. Default `HEAD`. */
	to?: string;
	/** Where progress lines go (stdout in the CLI). */
	print: (line: string) => void;
	dryRun?: boolean;
}

export interface DeployOnReleaseDeps extends Partial<Tree> {
	run?: Run;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Reads a package folder's task manifest; `loadTasksConfig` by default. */
	loadTasks?: (dir: string) => Promise<TasksConfig>;
}

export interface DeployOnReleaseResult {
	pkg: string;
	status: "ok" | "fail" | "skip" | "dry-run";
	message: string;
}

export interface DeployOnReleaseReport {
	/** `fail` if any package's deploy failed; `skip` if none applied to this release; else `ok`. */
	status: "ok" | "fail" | "skip";
	results: DeployOnReleaseResult[];
}
