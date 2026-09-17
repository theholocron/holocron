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
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../config/load-config.js";
import { getLogger } from "../logger.js";
import type { DeployFunctionResult, Deployment, DeploymentRecord, DeploymentTrigger } from "../plugin/capabilities.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";
import { assertPluginsResolvable } from "../plugin/workspace.js";
import { withSpinner } from "../ui/progress.js";
import { style } from "../ui/style.js";

export type DeployPrintLine = (line: string) => void;

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
		const record = await withSpinner(`Deploying ${input.branch}${input.target ? ` → ${input.target}` : ""}…`, () =>
			deploy.triggerDeployment({
				projectId: input.projectId,
				branch: input.branch,
				...(input.target ? { target: input.target } : {}),
			})
		);
		print(`  ${style.success(`${record.status} — ${record.url}`)}`);
		logger.info({ status: record.status, url: record.url, id: record.id }, "deploy: triggered");
		return { deployment: record, status: "ok" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
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
}

export interface DeployFilesReport {
	/** Null in dry-run mode or on failure — no actual deployment was created. */
	deployment: DeployFunctionResult | null;
	status: "ok" | "fail" | "dry-run";
	message?: string;
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".turbo"]);

/** Recursively lists absolute file paths under `dir`, skipping VCS/build noise. */
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
		print(`  ${style.success(result.url)}`);
		logger.info({ url: result.url, id: result.deploymentId }, "deploy: triggered (files)");
		return { deployment: result, status: "ok" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		print(`  ${style.fail(message)}`);
		logger.warn({ dir: input.dir, reason: message }, "deploy: failed (files)");
		return { deployment: null, status: "fail", message };
	}
}
