/**
 * `@theholocron/astromech/release` — a semantic-release plugin that runs a
 * workspace package's `delivery.deploy` task once a release has published,
 * for every package whose manifest asks for it (holocron#930):
 *
 * ```ts
 * // packages/<app>/holocron.config.ts
 * tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha", requires: ["VERCEL_TOKEN"] } }];
 * ```
 *
 * Why a `success` hook: semantic-release only runs `success` after every
 * plugin's `publish` step has finished, so every workspace package an app
 * pins is on npm by the time its deploy installs them (holocron#928). It is
 * also release config, not a GitHub Actions trigger, so it moves with the
 * release wherever releases run.
 *
 * For each package with such a task, the plugin deploys when the release is
 * on the task's `channel` (default `alpha`) and changes a file under the
 * package's paths: the package itself plus its `workspace:*` dependencies
 * ({@link defaultPaths}), or the task's explicit `with.paths`. It then waits
 * for npm to serve the release's new versions of those dependencies
 * ({@link waitForPublished}), since the registry can lag a version it has just
 * accepted (`success` is the last step; nothing later would help), and runs
 * `pnpm --filter <package> delivery.deploy`.
 *
 * A deploy failure is logged, never thrown: by `success`, the release is
 * already published, and failing the job would make a good release look
 * broken. `verifyConditions` warns early when a deploying release lacks one of
 * the task's `requires` env vars.
 *
 * `with` keys: `on` (must be `"release"` for this plugin to pick the task up),
 * `channel`, `paths`, `requires`. The CI workflow generators ignore a
 * `delivery.deploy` task with `on: "release"` — it isn't a push/PR workflow.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { loadTasksConfig } from "./config/load.js";
import { normalizeTaskEntry, type TasksConfig } from "./config/schema.js";

const DEFAULT_CHANNEL = "alpha";
const DEPLOY_TASK = "delivery.deploy";
/** How long to wait for npm to serve the release's versions, and how often to ask. */
const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const WAIT_INTERVAL_MS = 10 * 1000;

interface SpawnResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

export type Run = (command: string, args: string[], options: Record<string, unknown>) => SpawnResult;

interface Logger {
	log(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	success(message: string): void;
}

/** The slice of semantic-release's plugin context this plugin reads. */
export interface ReleaseContext {
	cwd: string;
	env: Record<string, string | undefined>;
	logger: Logger;
	branch?: { channel?: string | null };
	lastRelease?: { gitHead?: string };
	nextRelease: { gitHead: string; channel?: string | null };
}

/** A workspace package: folder name, absolute folder, and what its `package.json` says. */
export interface WorkspacePackage {
	name: string;
	dir: string;
	version: string | undefined;
	dependencies: Record<string, string>;
}

/** One package's release-time deploy, resolved from its manifest. */
export interface DeployTarget {
	pkg: WorkspacePackage;
	channel: string;
	/** Explicit `with.paths`, when the manifest sets them. */
	paths: string[] | undefined;
	requires: string[];
}

interface Tree {
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}

/** Every package under `<repoRoot>/packages/*` with a readable `package.json`. */
export function workspacePackages(repoRoot: string, { readJson, listDirs }: Tree): WorkspacePackage[] {
	const packagesDir = join(repoRoot, "packages");
	return listDirs(packagesDir).flatMap((folder) => {
		try {
			const manifest = readJson(join(packagesDir, folder, "package.json")) as {
				name?: string;
				version?: string;
				dependencies?: Record<string, string>;
			};
			if (!manifest.name) return [];
			return [
				{
					name: manifest.name,
					dir: join(packagesDir, folder),
					version: manifest.version,
					dependencies: manifest.dependencies ?? {},
				},
			];
		} catch {
			return [];
		}
	});
}

/** The `workspace:*` dependencies of `pkg`, as workspace packages (with their current version). */
export function workspaceDependencies(pkg: WorkspacePackage, all: WorkspacePackage[]): WorkspacePackage[] {
	const names = new Set(
		Object.entries(pkg.dependencies)
			.filter(([, spec]) => String(spec).startsWith("workspace:"))
			.map(([name]) => name)
	);
	return all.filter((candidate) => names.has(candidate.name));
}

/**
 * The paths a release must touch to redeploy `pkg` when its manifest doesn't
 * list them: its own folder plus the folder of every
 * {@link workspaceDependencies} entry. Derived rather than listed so a new or
 * dropped workspace dependency needs no second edit.
 *
 * @returns Repo-relative prefixes, each ending in `/`.
 */
export function defaultPaths(repoRoot: string, pkg: WorkspacePackage, all: WorkspacePackage[]): string[] {
	return [pkg, ...workspaceDependencies(pkg, all)].map(({ dir }) => `${relative(repoRoot, dir)}/`);
}

/**
 * The packages whose manifest declares a release-time `delivery.deploy`
 * (`with.on === "release"`), with the task's options resolved.
 */
export function deployTargets(packages: WorkspacePackage[], manifests: Map<string, TasksConfig>): DeployTarget[] {
	return packages.flatMap((pkg) => {
		const tasks = manifests.get(pkg.dir)?.tasks ?? [];
		return tasks.flatMap((item) => {
			const entry = normalizeTaskEntry(item);
			if (entry.name !== DEPLOY_TASK || entry.with?.["on"] !== "release") return [];
			const { channel, paths, requires } = entry.with;
			return [
				{
					pkg,
					channel: typeof channel === "string" ? channel : DEFAULT_CHANNEL,
					paths: Array.isArray(paths) ? paths.map(String) : undefined,
					requires: Array.isArray(requires) ? requires.map(String) : [],
				},
			];
		});
	});
}

/**
 * Waits until npm serves every `name@version` in `packages`, asking with
 * `npm view --prefer-online` (so npm's local cache can't answer for the
 * registry) every `intervalMs`, for up to `timeoutMs`.
 *
 * @returns The specs npm still doesn't serve; empty once all are available.
 */
export async function waitForPublished({
	packages,
	run,
	sleep,
	now,
	cwd,
	timeoutMs = WAIT_TIMEOUT_MS,
	intervalMs = WAIT_INTERVAL_MS,
}: {
	packages: { name: string; version: string }[];
	run: Run;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	cwd?: string;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<string[]> {
	const deadline = now() + timeoutMs;
	let pending = packages.map(({ name, version }) => `${name}@${version}`);
	for (;;) {
		pending = pending.filter((spec) => {
			const version = spec.slice(spec.lastIndexOf("@") + 1);
			const result = run("npm", ["view", spec, "version", "--prefer-online"], { cwd });
			return !(result.status === 0 && result.stdout.trim() === version);
		});
		if (pending.length === 0 || now() + intervalMs > deadline) return pending;
		await sleep(intervalMs);
	}
}

/**
 * @param changedFiles `undefined` when there's no previous release to diff against.
 */
export function shouldDeploy({
	channel,
	configuredChannel,
	changedFiles,
	paths,
}: {
	channel: string | undefined;
	configuredChannel: string;
	changedFiles: string[] | undefined;
	paths: string[];
}): { deploy: boolean; reason: string } {
	if (channel !== configuredChannel) {
		return { deploy: false, reason: `channel "${channel ?? "default"}" isn't "${configuredChannel}"` };
	}
	if (changedFiles === undefined) return { deploy: true, reason: "no previous release to diff against" };
	const touched = changedFiles.find((file) => paths.some((path) => file.startsWith(path)));
	return touched
		? { deploy: true, reason: `the release changes ${touched}` }
		: { deploy: false, reason: `the release changes nothing under ${paths.join(", ")}` };
}

/** The channel a release publishes to: semantic-release's own, or the branch's. */
function releaseChannel(context: ReleaseContext): string | undefined {
	return context.nextRelease.channel ?? context.branch?.channel ?? undefined;
}

export interface PluginDeps extends Partial<Tree> {
	run?: Run;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Reads a package folder's task manifest; `loadTasksConfig` by default. */
	loadTasks?: (dir: string) => Promise<TasksConfig>;
}

/**
 * Builds the plugin's hooks. Every effect is injectable so tests never spawn
 * git, npm or pnpm, read the real tree or wait; semantic-release itself uses
 * the default export's real implementations.
 */
export function createPlugin({
	run = (command, args, options) => spawnSync(command, args, { encoding: "utf8", ...options }) as SpawnResult,
	readJson = (path) => JSON.parse(readFileSync(path, "utf8")) as unknown,
	listDirs = (path) =>
		readdirSync(path, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name),
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now = Date.now,
	loadTasks = loadTasksConfig,
}: PluginDeps = {}) {
	async function discover(repoRoot: string) {
		const packages = workspacePackages(repoRoot, { readJson, listDirs });
		const manifests = new Map<string, TasksConfig>();
		for (const pkg of packages) {
			try {
				manifests.set(pkg.dir, await loadTasks(pkg.dir));
			} catch {
				// A package whose config won't load has no release-time deploy.
			}
		}
		return { packages, targets: deployTargets(packages, manifests) };
	}

	function changedFilesSince(context: ReleaseContext): string[] | undefined {
		const from = context.lastRelease?.gitHead;
		if (!from) return undefined;
		const result = run("git", ["diff", "--name-only", from, context.nextRelease.gitHead], { cwd: context.cwd });
		if (result.status !== 0) throw new Error(`git diff failed: ${result.stderr || result.status}`);
		return result.stdout.split("\n").filter(Boolean);
	}

	async function deploy(
		target: DeployTarget,
		packages: WorkspacePackage[],
		context: ReleaseContext,
		changedFiles: () => string[] | undefined
	) {
		const { logger } = context;
		const label = `deploy-on-release (${target.pkg.name})`;
		const channel = releaseChannel(context);

		let decision;
		try {
			decision = shouldDeploy({
				channel,
				configuredChannel: target.channel,
				// Only diff a release on the deploying channel; any other skips anyway.
				changedFiles: channel === target.channel ? changedFiles() : [],
				paths: target.paths ?? defaultPaths(context.cwd, target.pkg, packages),
			});
		} catch (err) {
			logger.error(`${label}: couldn't decide whether to deploy (${(err as Error).message}); skipping.`);
			return;
		}
		if (!decision.deploy) {
			logger.log(`${label}: skipping: ${decision.reason}.`);
			return;
		}

		const missing = target.requires.filter((name) => !context.env[name]);
		if (missing.length > 0) {
			logger.error(`${label}: ${missing.join(", ")} isn't set; skipping the deploy. Redeploy by hand.`);
			return;
		}

		let unpublished: string[];
		try {
			const dependencies = workspaceDependencies(target.pkg, packages).flatMap(({ name, version }) =>
				version ? [{ name, version }] : []
			);
			logger.log(
				`${label}: waiting for npm to serve ${dependencies.map((p) => `${p.name}@${p.version}`).join(", ")}.`
			);
			unpublished = await waitForPublished({ packages: dependencies, run, sleep, now, cwd: context.cwd });
		} catch (err) {
			logger.error(
				`${label}: couldn't check npm for the release's versions (${(err as Error).message}); skipping.`
			);
			return;
		}
		if (unpublished.length > 0) {
			logger.error(
				`${label}: npm still doesn't serve ${unpublished.join(", ")} after ${WAIT_TIMEOUT_MS / 60000} minutes; skipping the deploy. The release itself succeeded; redeploy by hand.`
			);
			return;
		}

		logger.log(`${label}: deploying because ${decision.reason}.`);
		const result = run("pnpm", ["--filter", target.pkg.name, DEPLOY_TASK], {
			cwd: context.cwd,
			env: context.env,
			stdio: "inherit",
		});
		if (result.status === 0) {
			logger.success(`${label}: deployed.`);
		} else {
			logger.error(
				`${label}: the deploy failed (exit ${result.status}). The release itself succeeded; redeploy by hand.`
			);
		}
	}

	return {
		/** Warns early, before anything publishes, when a deploying release lacks a required env var. */
		async verifyConditions(_pluginConfig: unknown, context: ReleaseContext): Promise<void> {
			const channel = releaseChannel(context);
			const { targets } = await discover(context.cwd);
			for (const target of targets) {
				const missing = target.requires.filter((name) => !context.env[name]);
				if (channel === target.channel && missing.length > 0) {
					context.logger.warn(
						`deploy-on-release (${target.pkg.name}): ${missing.join(", ")} isn't set; a release on "${channel}" will skip the deploy.`
					);
				}
			}
		},

		async success(_pluginConfig: unknown, context: ReleaseContext): Promise<void> {
			let discovered;
			try {
				discovered = await discover(context.cwd);
			} catch (err) {
				context.logger.error(
					`deploy-on-release: couldn't read the task manifests (${(err as Error).message}); skipping.`
				);
				return;
			}
			// One `git diff` shared by every target, taken only if one needs it.
			let diff: { files: string[] | undefined } | undefined;
			const changedFiles = () => (diff ??= { files: changedFilesSince(context) }).files;
			for (const target of discovered.targets) {
				await deploy(target, discovered.packages, context, changedFiles);
			}
		},
	};
}

const plugin = createPlugin();
export const verifyConditions = plugin.verifyConditions;
export const success = plugin.success;
