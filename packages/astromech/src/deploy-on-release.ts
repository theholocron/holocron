/**
 * Deploy workspace packages once a release has published (holocron#930).
 *
 * A package opts in with a `delivery.deploy` task in its own `holocron.config`
 * whose `with.on` is `"release"`:
 *
 * ```ts
 * // packages/<app>/holocron.config.ts
 * tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }];
 * ```
 *
 * `channel` defaults to `main` (a stable release); set a prerelease identifier
 * such as `alpha` to deploy those releases instead.
 *
 * The shared `delivery.publish` workflow runs this (`holocron deploy-on-release`)
 * as its own `deploy` job after the release job, so a deploy is a separate,
 * re-runnable check rather than a step buried in the release log. Each package
 * with such a task deploys when the release is on its `channel` and changes a file under its paths: the package itself plus its
 * `workspace:*` dependencies ({@link defaultPaths}), or an explicit
 * `with.paths`. It first waits for npm to serve the release's new versions of
 * those dependencies ({@link waitForPublished}) — the registry can lag a version
 * it has just accepted, and the deploy installs them — then runs
 * `pnpm --filter <package> delivery.deploy`.
 *
 * The release is already published by then, so a failed deploy can't undo it;
 * it fails this job instead, loudly and re-runnable on its own. A task is
 * `skip`ped (not failed) only when it doesn't apply to this release.
 *
 * A `delivery.deploy` task with `on: "release"` generates no CI workflow.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { loadTasksConfig } from "./config/load.js";
import { normalizeTaskEntry, type TasksConfig } from "./config/schema.js";

/** A stable release (no prerelease identifier) is on `main`, the default channel for a task. */
const MAIN_CHANNEL = "main";
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

/** A workspace package: absolute folder, and what its `package.json` says. */
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
}

interface Tree {
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}

/** Every package under `<repoRoot>/packages/*` with a readable, named `package.json`. */
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
	return packages.flatMap((pkg) =>
		(manifests.get(pkg.dir)?.tasks ?? []).flatMap((item) => {
			const entry = normalizeTaskEntry(item);
			if (entry.name !== DEPLOY_TASK || entry.with?.["on"] !== "release") return [];
			const { channel, paths } = entry.with;
			return [
				{
					pkg,
					channel: typeof channel === "string" ? channel : MAIN_CHANNEL,
					paths: Array.isArray(paths) ? paths.map(String) : undefined,
				},
			];
		})
	);
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
 * @param channel The release's channel: its prerelease identifier (`alpha`), or `main` for a stable release.
 * @param changedFiles `undefined` when there's no previous release to diff against.
 */
export function shouldDeploy({
	channel,
	configuredChannel,
	changedFiles,
	paths,
}: {
	channel: string;
	configuredChannel: string;
	changedFiles: string[] | undefined;
	paths: string[];
}): { deploy: boolean; reason: string } {
	if (channel !== configuredChannel) {
		return { deploy: false, reason: `channel "${channel}" isn't "${configuredChannel}"` };
	}
	if (changedFiles === undefined) return { deploy: true, reason: "no previous release to diff against" };
	const touched = changedFiles.find((file) => paths.some((path) => file.startsWith(path)));
	return touched
		? { deploy: true, reason: `the release changes ${touched}` }
		: { deploy: false, reason: `the release changes nothing under ${paths.join(", ")}` };
}

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

export const defaultRun: Run = (command, args, opts) =>
	spawnSync(command, args, { encoding: "utf8", ...opts }) as SpawnResult;

export const defaultReadJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown;

export const defaultListDirs = (path: string): string[] =>
	readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

export const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deploys every package whose manifest declares a release-time deploy that
 * applies to this release. Never throws for a deploy problem: each package's
 * outcome is in the report, and `status: "fail"` is the caller's exit code.
 */
export async function deployOnRelease(
	options: DeployOnReleaseOptions,
	{
		run = defaultRun,
		readJson = defaultReadJson,
		listDirs = defaultListDirs,
		sleep = defaultSleep,
		now = Date.now,
		loadTasks = loadTasksConfig,
	}: DeployOnReleaseDeps = {}
): Promise<DeployOnReleaseReport> {
	const { cwd, from, print } = options;
	const channel = options.channel || MAIN_CHANNEL;
	const to = options.to ?? "HEAD";

	const packages = workspacePackages(cwd, { readJson, listDirs });
	const manifests = new Map<string, TasksConfig>();
	for (const pkg of packages) {
		try {
			manifests.set(pkg.dir, await loadTasks(pkg.dir));
		} catch (err) {
			print(`${pkg.name}: couldn't read its task manifest (${(err as Error).message}); not deploying it.`);
		}
	}
	const targets = deployTargets(packages, manifests);
	if (targets.length === 0) {
		print("No package declares a release-time delivery.deploy (with.on: release).");
		return { status: "skip", results: [] };
	}

	// One `git diff` shared by every target, taken only if one needs it.
	let diff: { files: string[] | undefined; error?: string } | undefined;
	const changedFiles = (): { files: string[] | undefined; error?: string } => {
		if (diff) return diff;
		if (!from) return (diff = { files: undefined });
		const result = run("git", ["diff", "--name-only", from, to], { cwd });
		return (diff =
			result.status === 0
				? { files: result.stdout.split("\n").filter(Boolean) }
				: { files: [], error: `git diff ${from} ${to} failed: ${result.stderr || result.status}` });
	};

	const results: DeployOnReleaseResult[] = [];
	const record = (pkg: string, status: DeployOnReleaseResult["status"], message: string) => {
		results.push({ pkg, status, message });
		print(`${status === "fail" ? "✗ " : ""}${pkg}: ${message}`);
	};

	for (const target of targets) {
		const name = target.pkg.name;
		const matches = target.channel === channel;
		const { files, error } = matches ? changedFiles() : { files: [], error: undefined };
		if (error) {
			record(name, "fail", error);
			continue;
		}
		const decision = shouldDeploy({
			channel,
			configuredChannel: target.channel,
			changedFiles: files,
			paths: target.paths ?? defaultPaths(cwd, target.pkg, packages),
		});
		if (!decision.deploy) {
			record(name, "skip", `not deploying: ${decision.reason}.`);
			continue;
		}
		if (options.dryRun) {
			record(name, "dry-run", `would deploy because ${decision.reason}.`);
			continue;
		}

		const dependencies = workspaceDependencies(target.pkg, packages).flatMap(({ name: dep, version }) =>
			version ? [{ name: dep, version }] : []
		);
		print(
			`${name}: waiting for npm to serve ${dependencies.map((d) => `${d.name}@${d.version}`).join(", ") || "nothing"}.`
		);
		const unpublished = await waitForPublished({ packages: dependencies, run, sleep, now, cwd });
		if (unpublished.length > 0) {
			record(
				name,
				"fail",
				`npm still doesn't serve ${unpublished.join(", ")} after ${WAIT_TIMEOUT_MS / 60000} minutes. Re-run this job once it does.`
			);
			continue;
		}

		print(`${name}: deploying because ${decision.reason}.`);
		const result = run("pnpm", ["--filter", name, DEPLOY_TASK], { cwd, env: process.env, stdio: "inherit" });
		if (result.status === 0) record(name, "ok", "deployed.");
		else record(name, "fail", `the deploy failed (exit ${result.status}).`);
	}

	const status = results.some((r) => r.status === "fail")
		? "fail"
		: results.every((r) => r.status === "skip")
			? "skip"
			: "ok";
	return { status, results };
}
