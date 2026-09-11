/**
 * `holocron deploy` — trigger a deployment via the configured
 * `deployment` capability.
 *
 * Errors clearly when `deployment` isn't loaded (no provider declared
 * in `holocron.config.json`). Returns the resulting deployment record
 * so callers can print the URL + status.
 *
 * Dry-run skips the actual triggerDeployment call but still verifies
 * the deployment capability is present, so operators can sanity-check
 * the wiring without spinning up a build.
 */

import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../config/load-config.js";
import { getLogger } from "../logger.js";
import type { Deployment, DeploymentRecord, DeploymentTrigger } from "../plugin/capabilities.js";
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
