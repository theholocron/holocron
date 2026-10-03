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
 * It deploys only when the release is on the configured channel and touches
 * one of the configured paths (Sentinel itself, plus the workspace packages
 * inlined into its `dist/`), so most releases skip it. A deploy failure is
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

const DEPLOY_COMMAND = ["pnpm", ["--filter", "@theholocron/sentinel", "delivery.deploy"]];

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

/**
 * Builds the plugin's hooks. `run` is injectable so tests never spawn git or
 * pnpm; semantic-release itself uses the default export's real runner.
 */
export function createPlugin({ run = defaultRun } = {}) {
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
			if (releaseChannel(context) === pluginConfig.channel && !context.env.VERCEL_TOKEN) {
				context.logger.warn(
					`deploy-on-release: VERCEL_TOKEN isn't set; a release on "${pluginConfig.channel}" will skip the Sentinel deploy.`
				);
			}
		},

		success(pluginConfig, context) {
			const { logger } = context;
			const channel = releaseChannel(context);
			let decision;
			try {
				decision = shouldDeploy({
					channel,
					configuredChannel: pluginConfig.channel,
					// Only diff a release on the deploying channel; any other skips anyway.
					changedFiles: channel === pluginConfig.channel ? changedFilesSince(context) : [],
					paths: pluginConfig.paths,
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
