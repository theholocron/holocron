/**
 * `holocron deploy` — trigger a deployment via the configured
 * `deployment` capability.
 *
 * Two modes, one command: `runDeploy` (the default — a Git branch,
 * `triggerDeployment()`) and `runDeployFromFiles` (`--files <dir>` —
 * a local directory of source files, `deployFunction()`, no linked
 * repo required — for a consumer with no Git history to deploy from,
 * e.g. Sentinel, shipped as an npm package). Separate functions, not
 * one branching `runDeploy`, because their inputs genuinely differ
 * (`branch` vs `dir`) and their result shapes differ too
 * (`DeploymentRecord` carries `status`/`branch`; `DeployFunctionResult`
 * is deliberately minimal, same as `DeployScriptResult` for Workers).
 *
 * Errors clearly when `deployment` isn't loaded (no provider declared
 * in `holocron.config.json`), or when the configured provider doesn't
 * implement `deployFunction` (it's optional on `Deployment` — not
 * every provider has a files-based deploy API).
 *
 * Dry-run skips the actual deploy call but still verifies the
 * deployment capability (and, for `--files`, `deployFunction`) is
 * present, so operators can sanity-check the wiring without spinning
 * up a build.
 *
 * **Both modes wait for the deployment to finish** (holocron#911): a
 * provider accepting the upload/trigger is not the deployment succeeding.
 * Vercel builds asynchronously — an `npm install` failure there leaves
 * the deployment in `ERROR` while production keeps serving the previous
 * one, and this command used to report `ok` regardless (found live:
 * Sentinel's holocron#910 deploy "succeeded" in CI, never went live). So
 * after triggering, {@link waitForDeployment} polls
 * `Deployment.getDeployment()` until a terminal state; only `ready` is
 * `ok`, while `error` / `cancelled` / a timeout are `fail` (non-zero exit
 * via `cli.ts`).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { errorMessage } from "@theholocron/misc-utils";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../config/load-config.js";
import { getLogger } from "../logger.js";
import type { DeployFunctionResult, Deployment, DeploymentRecord, DeploymentTrigger } from "../plugin/capabilities.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";
import { assertPluginsResolvable } from "../plugin/workspace.js";
import { withSpinner } from "../ui/progress.js";
import { style } from "../ui/style.js";

export type DeployPrintLine = (line: string) => void;

/** How long {@link waitForDeployment} polls, and the clock it polls with — injectable so tests never sleep. */
export interface DeployWaitOptions {
	/** Give up (and report `fail`) after this long. Default 10 minutes. */
	timeoutMs?: number;
	/** Delay between `getDeployment()` polls. Default 5 s. */
	intervalMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_WAIT_INTERVAL_MS = 5_000;

const TERMINAL_STATUSES: ReadonlySet<DeploymentRecord["status"]> = new Set(["ready", "error", "cancelled"]);

/**
 * Polls `getDeployment(id)` until the deployment reaches a terminal status
 * (`ready` / `error` / `cancelled`). Throws on timeout — the caller turns
 * that into a `fail` report, same as a provider throwing mid-trigger.
 */
export async function waitForDeployment(
	deploy: Deployment,
	deploymentId: string,
	options: DeployWaitOptions = {}
): Promise<DeploymentRecord> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
	const intervalMs = options.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = options.now ?? Date.now;

	const deadline = now() + timeoutMs;
	for (;;) {
		const record = await deploy.getDeployment(deploymentId);
		if (TERMINAL_STATUSES.has(record.status)) return record;
		if (now() >= deadline) {
			throw new Error(
				`deployment ${deploymentId} still ${record.status} after ${Math.round(timeoutMs / 1000)}s — check the provider's dashboard`
			);
		}
		await sleep(intervalMs);
	}
}

/** One terminal, non-ready record as a single human-readable failure line. */
function terminalFailure(record: DeploymentRecord): string {
	return `deployment ${record.id} ended ${record.status}${record.errorMessage ? `: ${record.errorMessage}` : ""}`;
}

/**
 * Provider `url` fields (Vercel's REST API, at least) come back as bare
 * hostnames — `"my-app.vercel.app"`, no scheme — which terminals don't
 * linkify and browsers won't navigate to unmodified. Printed output
 * should be a URL a human can click/paste; structured log fields keep
 * the raw provider value as-is.
 */
function withScheme(url: string): string {
	return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export interface RunDeployInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vendor project id (e.g., Vercel prj_*). Required. */
	projectId: string;
	/** Git branch to deploy. */
	branch: string;
	/** Named target — `undefined` means branch preview. */
	target?: DeploymentTrigger;
	loader?: PluginLoader;
	print?: DeployPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	wait?: DeployWaitOptions;
}

export interface DeployReport {
	/** Null in dry-run mode (no actual deployment was triggered). */
	deployment: DeploymentRecord | null;
	status: "ok" | "fail" | "dry-run";
	message?: string;
}

export async function runDeploy(input: RunDeployInput): Promise<DeployReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "deploy");

	const dryRun = input.context.dryRun ?? false;
	logger.info(
		{
			branch: input.branch,
			target: input.target ?? "preview",
			projectId: input.projectId,
			dryRun: dryRun || undefined,
		},
		"deploy: start"
	);

	print(
		style.header(
			`Holocron deploy — branch=${input.branch}${
				input.target ? `, target=${input.target}` : " (preview)"
			}${dryRun ? " (dry-run)" : ""}`
		)
	);

	if (!loader.has("deployment")) {
		throw new Error(
			"deployment capability is not configured — add a `deployment` provider to holocron.config.json"
		);
	}
	const deploy = loader.get("deployment") as Deployment;

	if (dryRun) {
		const message = `would: ${deploy.providerName}.triggerDeployment(projectId=${input.projectId}, branch=${input.branch}${
			input.target ? `, target=${input.target}` : ""
		})`;
		print(`  ${style.dim(`… ${message}`)}`);
		return { deployment: null, status: "dry-run", message };
	}

	try {
		const triggered = await withSpinner(
			`Deploying ${input.branch}${input.target ? ` → ${input.target}` : ""}…`,
			() =>
				deploy.triggerDeployment({
					projectId: input.projectId,
					branch: input.branch,
					...(input.target ? { target: input.target } : {}),
				})
		);
		logger.info({ status: triggered.status, url: triggered.url, id: triggered.id }, "deploy: triggered");
		const record = TERMINAL_STATUSES.has(triggered.status)
			? triggered
			: await withSpinner(`Waiting for ${withScheme(triggered.url)} to finish…`, () =>
					waitForDeployment(deploy, triggered.id, input.wait)
				);
		if (record.status !== "ready") {
			const message = terminalFailure(record);
			print(`  ${style.fail(`${message} — ${withScheme(triggered.url)}`)}`);
			logger.warn({ id: record.id, status: record.status, reason: record.errorMessage }, "deploy: failed");
			return { deployment: record, status: "fail", message };
		}
		print(`  ${style.success(`${record.status} — ${withScheme(triggered.url)}`)}`);
		logger.info({ status: record.status, url: triggered.url, id: record.id }, "deploy: ready");
		return { deployment: record, status: "ok" };
	} catch (err) {
		const message = errorMessage(err);
		print(`  ${style.fail(message)}`);
		logger.warn({ branch: input.branch, reason: message }, "deploy: failed");
		return { deployment: null, status: "fail", message };
	}
}

// ── deploy --files (deployFunction) ─────────────────────────────────────

export interface RunDeployFromFilesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vendor project id (e.g., Vercel prj_*). Required. */
	projectId: string;
	/** Local directory to deploy — walked recursively. Files are keyed by
	 * their path relative to this directory, POSIX-separated. */
	dir: string;
	/** Named target — `undefined` means preview. */
	target?: DeploymentTrigger;
	loader?: PluginLoader;
	print?: DeployPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. */
	walkFiles?: (dir: string) => string[];
	readFile?: (path: string) => string;
	wait?: DeployWaitOptions;
}

export interface DeployFilesReport {
	/** Null in dry-run mode or on failure — no actual deployment was created. */
	deployment: DeployFunctionResult | null;
	status: "ok" | "fail" | "dry-run";
	message?: string;
}

// Deliberately no "dist" here, unlike holocron new repo's own file-walker this
// was modeled on: --files exists specifically to deploy build output, so
// a directory literally named "dist" is exactly what a caller usually
// means to include, not exclude.
const SKIP_DIRS = new Set([".git", "node_modules", ".turbo"]);

/** Recursively lists absolute file paths under `dir`, skipping VCS/tooling noise. */
function defaultWalkFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) results.push(...defaultWalkFiles(full));
		else if (stat.isFile()) results.push(full);
	}
	return results;
}

/** `holocron deploy --files <dir>` — the non-git counterpart to `runDeploy`. */
export async function runDeployFromFiles(input: RunDeployFromFilesInput): Promise<DeployFilesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "deploy");

	const dryRun = input.context.dryRun ?? false;
	const walkFiles = input.walkFiles ?? defaultWalkFiles;
	const readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));

	const files: Record<string, string> = {};
	for (const abs of walkFiles(input.dir)) {
		const rel = relative(input.dir, abs).split(sep).join("/");
		files[rel] = readFile(abs);
	}
	const fileCount = Object.keys(files).length;

	logger.info(
		{
			dir: input.dir,
			fileCount,
			target: input.target ?? "preview",
			projectId: input.projectId,
			dryRun: dryRun || undefined,
		},
		"deploy: start (files)"
	);

	print(
		style.header(
			`Holocron deploy — files=${input.dir} (${fileCount} file${fileCount === 1 ? "" : "s"})${
				input.target ? `, target=${input.target}` : " (preview)"
			}${dryRun ? " (dry-run)" : ""}`
		)
	);

	if (!loader.has("deployment")) {
		throw new Error(
			"deployment capability is not configured — add a `deployment` provider to holocron.config.json"
		);
	}
	const deploy = loader.get("deployment") as Deployment;
	if (!deploy.deployFunction) {
		throw new Error(
			`deployment provider "${deploy.providerName}" does not support deploying from files — deployFunction() is not implemented`
		);
	}

	if (dryRun) {
		const message = `would: ${deploy.providerName}.deployFunction(projectId=${input.projectId}, files=${fileCount}${
			input.target ? `, target=${input.target}` : ""
		})`;
		print(`  ${style.dim(`… ${message}`)}`);
		return { deployment: null, status: "dry-run", message };
	}

	try {
		const result = await withSpinner(
			`Deploying ${fileCount} file${fileCount === 1 ? "" : "s"} from ${input.dir}…`,
			() => deploy.deployFunction!(input.projectId, { files, ...(input.target ? { target: input.target } : {}) })
		);
		logger.info({ url: result.url, id: result.deploymentId }, "deploy: triggered (files)");
		const record = await withSpinner(`Waiting for ${withScheme(result.url)} to finish…`, () =>
			waitForDeployment(deploy, result.deploymentId, input.wait)
		);
		if (record.status !== "ready") {
			const message = terminalFailure(record);
			print(`  ${style.fail(`${message} — ${withScheme(result.url)}`)}`);
			logger.warn(
				{ id: record.id, status: record.status, reason: record.errorMessage },
				"deploy: failed (files)"
			);
			return { deployment: result, status: "fail", message };
		}
		print(`  ${style.success(withScheme(result.url))}`);
		logger.info({ url: result.url, id: result.deploymentId }, "deploy: ready (files)");
		return { deployment: result, status: "ok" };
	} catch (err) {
		const message = errorMessage(err);
		print(`  ${style.fail(message)}`);
		logger.warn({ dir: input.dir, reason: message }, "deploy: failed (files)");
		return { deployment: null, status: "fail", message };
	}
}
