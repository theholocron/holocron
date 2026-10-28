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
 * The shared `delivery.publish` workflow runs this (`holocron deploy on-release`)
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

import { loadTasksConfig } from "../../config/load/index.js";
import type { TasksConfig } from "../../config/schema/index.js";
import { defaultListDirs, defaultReadJson, defaultRun, defaultSleep } from "../../utils/index.js";
import { DEPLOY_TASK, MAIN_CHANNEL, WAIT_TIMEOUT_MS } from "./constants.js";
import { defaultPaths } from "./default-paths/index.js";
import type {
	DeployOnReleaseDeps,
	DeployOnReleaseOptions,
	DeployOnReleaseReport,
	DeployOnReleaseResult,
} from "./deploy-on-release.type.js";
import { deployTargets } from "./deploy-targets/index.js";
import { shouldDeploy } from "./should-deploy/index.js";
import { waitForPublished } from "./wait-for-published/index.js";
import { workspaceDependencies } from "./workspace-dependencies/index.js";
import { workspacePackages } from "./workspace-packages/index.js";

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
