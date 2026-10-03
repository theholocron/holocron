/** See `deploy-on-release.mjs`. */
export interface DeployOnReleaseConfig {
	/** The release channel that deploys. Defaults to `"alpha"`. */
	channel?: string;
	/** Repo-relative path prefixes; the release must change a file under one of them. Defaults to {@link defaultPaths}. */
	paths?: string[];
}

interface SpawnResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

type Run = (command: string, args: string[], options: Record<string, unknown>) => SpawnResult;

interface Logger {
	log(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	success(message: string): void;
}

/** The slice of semantic-release's plugin context this plugin reads. */
export interface ReleaseContext {
	cwd?: string;
	env: Record<string, string | undefined>;
	logger: Logger;
	branch?: { channel?: string | null };
	lastRelease?: { gitHead?: string };
	nextRelease: { gitHead: string; channel?: string | null };
}

export function shouldDeploy(input: {
	channel: string | undefined;
	configuredChannel: string;
	changedFiles: string[] | undefined;
	paths: string[];
}): { deploy: boolean; reason: string };

export function defaultPaths(input: {
	repoRoot: string;
	sentinelDir: string;
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}): string[];

export function createPlugin(options?: {
	run?: Run;
	readJson?: (path: string) => unknown;
	listDirs?: (path: string) => string[];
	sentinelDir?: string;
}): {
	verifyConditions(pluginConfig: DeployOnReleaseConfig, context: ReleaseContext): void;
	success(pluginConfig: DeployOnReleaseConfig, context: ReleaseContext): void;
};

export function verifyConditions(pluginConfig: DeployOnReleaseConfig, context: ReleaseContext): void;
export function success(pluginConfig: DeployOnReleaseConfig, context: ReleaseContext): void;
