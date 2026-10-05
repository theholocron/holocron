/**
 * A semantic-release plugin that deploys Sentinel once a release has
 * published (holocron#928). Wired up in the repo root's `release.config.ts`.
 *
 * Why a `success` hook: semantic-release only runs `success` after every
 * plugin's `publish` step has finished, so every `@theholocron/*` package
 * `stage-deploy.mjs` pins is on npm by the time the deploy installs them.
 * A hand-dispatched deploy raced the release once (`cli@5.0.0-alpha.104`
 * published five seconds after Vercel's `npm install` gave up). And being
 * Node-side release config rather than a GitHub Actions trigger, it moves
 * with the release when releases run through Sentinel's dispatch.
 *
 * It deploys only when the release is on the configured channel (default
 * `alpha`) and touches one of the configured paths (default: Sentinel itself
 * plus the workspace packages inlined into its `dist/`, derived from its
 * `package.json` by {@link defaultPaths}), so most releases skip it. Both are
 * plugin options in `release.config.ts`; moving them into the task manifest
 * is holocron#930.
 *
 * Before deploying, it also waits for npm to serve the release's new
 * versions of those workspace packages ({@link waitForPublished}). `success`
 * runs once `npm publish` has returned, but the registry can take a moment
 * to serve a version it has just accepted: the first release through this
 * plugin started its deploy 0.3s after `astromech@5.0.0-alpha.105` published,
 * and Vercel's `npm install` failed. Nothing later in semantic-release's
 * lifecycle would help (`success` is the last step; only `fail` follows), so
 * the wait lives here.
 *
 * A deploy failure is
 * logged, never thrown: by `success`, the release is already published, and
 * failing the job would make a good release look broken. Redeploy by hand
 * with the Sentinel Deploy workflow.
 *
 * Making this a generic `@theholocron/semantic-release-config` option is
 * holocron#930, for when a second app needs it.
 *
 * Plain `.mjs` like its neighbours: semantic-release loads it by path, and
 * `shouldDeploy()` is exported pure so it's unit-tested without a release.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY_COMMAND = ["pnpm", ["--filter", "@theholocron/sentinel", "delivery.deploy"]];
const DEFAULT_CHANNEL = "alpha";
/** How long to wait for npm to serve the release's versions, and how often to ask. */
const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const WAIT_INTERVAL_MS = 10 * 1000;
/** `packages/sentinel`, wherever this script is checked out. */
const SENTINEL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Sentinel's `workspace:*` dependencies — the packages `tsdown.config.ts`
 * inlines into `dist/` (holocron#922) — found by package name under
 * `packages/*`, each with its folder and current `version` (by `success`,
 * the release's prepare step has already bumped it).
 *
 * @param {{ repoRoot: string; sentinelDir: string; readJson: (path: string) => any; listDirs: (path: string) => string[] }} input
 * @returns {{ name: string; dir: string; version: string | undefined }[]}
 */
export function workspaceDependencies({ repoRoot, sentinelDir, readJson, listDirs }) {
	const pkg = readJson(join(sentinelDir, "package.json"));
	const names = new Set(
		Object.entries(pkg.dependencies ?? {})
			.filter(([, spec]) => String(spec).startsWith("workspace:"))
			.map(([name]) => name)
	);
	const packagesDir = join(repoRoot, "packages");
	return listDirs(packagesDir).flatMap((dir) => {
		let manifest;
		try {
			manifest = readJson(join(packagesDir, dir, "package.json"));
		} catch {
			return [];
		}
		return names.has(manifest.name)
			? [{ name: manifest.name, dir: join(packagesDir, dir), version: manifest.version }]
			: [];
	});
}

/**
 * The paths a release must touch to redeploy Sentinel, when the config
 * doesn't list them: Sentinel's own folder plus the folder of every
 * {@link workspaceDependencies} entry. Derived rather than listed so a new or
 * dropped workspace dependency needs no second edit.
 *
 * @param {{ repoRoot: string; sentinelDir: string; readJson: (path: string) => any; listDirs: (path: string) => string[] }} input
 * @returns {string[]} Repo-relative prefixes, each ending in `/`.
 */
export function defaultPaths(input) {
	const { repoRoot, sentinelDir } = input;
	return [sentinelDir, ...workspaceDependencies(input).map((dep) => dep.dir)].map(
		(dir) => `${relative(repoRoot, dir)}/`
	);
}

/**
 * Waits until npm serves every `name@version` in `packages`, asking with
 * `npm view --prefer-online` (so npm's local cache can't answer for the
 * registry) every `intervalMs`, for up to `timeoutMs`.
 *
 * @param {{ packages: { name: string; version: string }[]; run: Function; sleep: (ms: number) => Promise<void>; now: () => number; cwd?: string; timeoutMs?: number; intervalMs?: number }} input
 * @returns {Promise<string[]>} The specs npm still doesn't serve; empty once all are available.
 */
export async function waitForPublished({
	packages,
	run,
	sleep,
	now,
	cwd,
	timeoutMs = WAIT_TIMEOUT_MS,
	intervalMs = WAIT_INTERVAL_MS,
}) {
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
 * @param {{ channel: string | undefined; configuredChannel: string; changedFiles: string[] | undefined; paths: string[] }} input
 *   `changedFiles` is `undefined` when there's no previous release to diff against.
 * @returns {{ deploy: boolean; reason: string }}
 */
export function shouldDeploy({ channel, configuredChannel, changedFiles, paths }) {
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
function releaseChannel(context) {
	return context.nextRelease?.channel ?? context.branch?.channel ?? undefined;
}

function defaultRun(command, args, options) {
	return spawnSync(command, args, { encoding: "utf8", ...options });
}

function defaultReadJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function defaultSleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultListDirs(path) {
	return readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

/**
 * Builds the plugin's hooks. `run`, `readJson`, `listDirs`, `sleep` and
 * `now` are injectable so tests never spawn git, npm or pnpm, read the real
 * tree or wait; semantic-release itself uses the default export's real
 * implementations.
 */
export function createPlugin({
	run = defaultRun,
	readJson = defaultReadJson,
	listDirs = defaultListDirs,
	sleep = defaultSleep,
	now = Date.now,
	sentinelDir = SENTINEL_DIR,
} = {}) {
	/** Both options are optional: `channel` defaults to alpha, `paths` to {@link defaultPaths}. */
	function resolveConfig(pluginConfig, context) {
		return {
			channel: pluginConfig.channel ?? DEFAULT_CHANNEL,
			paths: pluginConfig.paths ?? defaultPaths({ repoRoot: context.cwd, sentinelDir, readJson, listDirs }),
		};
	}

	function changedFilesSince(context) {
		const from = context.lastRelease?.gitHead;
		if (!from) return undefined;
		const result = run("git", ["diff", "--name-only", from, context.nextRelease.gitHead], { cwd: context.cwd });
		if (result.status !== 0) throw new Error(`git diff failed: ${result.stderr || result.status}`);
		return result.stdout.split("\n").filter(Boolean);
	}

	return {
		/** Warns early, before anything publishes, when a deploying release has no Vercel token. */
		verifyConditions(pluginConfig, context) {
			const channel = pluginConfig.channel ?? DEFAULT_CHANNEL;
			if (releaseChannel(context) === channel && !context.env.VERCEL_TOKEN) {
				context.logger.warn(
					`deploy-on-release: VERCEL_TOKEN isn't set; a release on "${channel}" will skip the Sentinel deploy.`
				);
			}
		},

		async success(pluginConfig, context) {
			const { logger } = context;
			const channel = releaseChannel(context);
			let decision;
			try {
				const config = resolveConfig(pluginConfig, context);
				decision = shouldDeploy({
					channel,
					configuredChannel: config.channel,
					// Only diff a release on the deploying channel; any other skips anyway.
					changedFiles: channel === config.channel ? changedFilesSince(context) : [],
					paths: config.paths,
				});
			} catch (err) {
				logger.error(`deploy-on-release: couldn't decide whether to deploy (${err.message}); skipping.`);
				return;
			}

			if (!decision.deploy) {
				logger.log(`deploy-on-release: skipping the Sentinel deploy: ${decision.reason}.`);
				return;
			}
			if (!context.env.VERCEL_TOKEN) {
				logger.error(
					"deploy-on-release: VERCEL_TOKEN isn't set; skipping the Sentinel deploy. Redeploy by hand."
				);
				return;
			}

			let unpublished;
			try {
				const packages = workspaceDependencies({
					repoRoot: context.cwd,
					sentinelDir,
					readJson,
					listDirs,
				}).filter((dep) => dep.version);
				logger.log(
					`deploy-on-release: waiting for npm to serve ${packages.map((p) => `${p.name}@${p.version}`).join(", ")}.`
				);
				unpublished = await waitForPublished({ packages, run, sleep, now, cwd: context.cwd });
			} catch (err) {
				logger.error(
					`deploy-on-release: couldn't check npm for the release's versions (${err.message}); skipping.`
				);
				return;
			}
			if (unpublished.length > 0) {
				logger.error(
					`deploy-on-release: npm still doesn't serve ${unpublished.join(", ")} after ${WAIT_TIMEOUT_MS / 60000} minutes; skipping the Sentinel deploy. The release itself succeeded; redeploy with the Sentinel Deploy workflow.`
				);
				return;
			}

			logger.log(`deploy-on-release: deploying Sentinel because ${decision.reason}.`);
			const [command, args] = DEPLOY_COMMAND;
			const result = run(command, args, { cwd: context.cwd, env: context.env, stdio: "inherit" });
			if (result.status === 0) {
				logger.success("deploy-on-release: Sentinel deployed.");
			} else {
				logger.error(
					`deploy-on-release: the Sentinel deploy failed (exit ${result.status}). The release itself succeeded; redeploy with the Sentinel Deploy workflow.`
				);
			}
		},
	};
}

const plugin = createPlugin();
export const verifyConditions = plugin.verifyConditions;
export const success = plugin.success;
