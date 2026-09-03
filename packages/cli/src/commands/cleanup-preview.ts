import { checkbox } from "@inquirer/prompts";

import type { LoadedConfig } from "../config/load-config.js";
import type { Deployment, DeploymentRecord, PullRequest, Source } from "../plugin/capabilities.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";
import { style } from "../ui/style.js";

export interface RunCleanupPreviewInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** PR number to look up on the source provider. */
	prNumber: number;
	/**
	 * "owner/name" override — when provided, the PR is looked up in this repo
	 * instead of the one the source plugin is scoped to.
	 */
	repo?: string;
	/** Cloudflare Pages project name (e.g. "theholocron-preview"). */
	project: string;
	loader?: PluginLoader;
	print?: (line: string) => void;
}

export interface CleanupPreviewReport {
	pr: PullRequest;
	/** Branch alias used to query Cloudflare (e.g. "holocron-pr-42"). */
	branch: string;
	found: number;
	deleted: number;
	status: "ok" | "none" | "aborted" | "fail";
	message?: string;
}

function prStateLabel(pr: PullRequest): string {
	if (pr.merged) return style.success("merged");
	if (pr.state === "closed") return style.dim("closed (not merged)");
	return style.warn("open");
}

export async function runCleanupPreview(input: RunCleanupPreviewInput): Promise<CleanupPreviewReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	// c8 ignore next -- real PluginLoader construction is integration-level; unit tests always supply loader
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	// ── 1. Look up the PR ───────────────────────────────────────────────
	if (!loader.has("source")) {
		throw new Error("source capability is not configured — add a source provider to holocron.config.json");
	}
	const source = loader.get("source") as Source;
	if (!source.getPullRequest) {
		throw new Error(`${source.providerName} source provider does not support getPullRequest`);
	}

	let pr: PullRequest;
	try {
		pr = await source.getPullRequest(input.prNumber, input.repo);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to fetch PR #${input.prNumber}: ${message}`, { cause: err });
	}

	// Derive the Cloudflare branch alias from the repo name and PR number.
	// Matches the convention the deploy-preview workflow uses:
	// --branch ${{ github.event.repository.name }}-pr-${{ github.event.pull_request.number }}
	const repoName = (input.repo ?? input.loaded.resolved.repo?.name ?? "").split("/").pop()!;
	const branch = `${repoName}-pr-${pr.number}`;

	print("");
	print(`${style.header(`PR #${pr.number}`)} — ${pr.title}`);
	print(`  Status : ${prStateLabel(pr)}  |  Branch : ${style.dim(pr.branch)}`);
	print(`  URL    : ${style.dim(pr.url)}`);
	print(`  CF alias : ${style.dim(branch)}`);
	print("");

	// ── 2. List deployments ─────────────────────────────────────────────
	if (!loader.has("deployment")) {
		throw new Error("deployment capability is not configured — add a deployment provider to holocron.config.json");
	}
	const deploy = loader.get("deployment") as Deployment;
	if (!deploy.listPreviewDeployments || !deploy.deletePreviewDeployments) {
		throw new Error(`${deploy.providerName} deployment provider does not support preview cleanup`);
	}

	let deployments: DeploymentRecord[];
	try {
		deployments = await deploy.listPreviewDeployments(input.project, branch);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to list deployments: ${message}`, { cause: err });
	}

	if (deployments.length === 0) {
		print(style.dim(`No deployments found for branch ${branch}.`));
		return { pr, branch, found: 0, deleted: 0, status: "none" };
	}

	print(`Found ${deployments.length} deployment${deployments.length === 1 ? "" : "s"} for ${style.dim(branch)}:`);
	print("");

	if (pr.state === "open") {
		print(
			style.warn(
				`PR #${pr.number} is still open. Deleting its preview deployments will break the live preview link.`
			)
		);
		print(style.warn("Nothing is pre-selected — check the deployments you want to remove."));
		print("");
	}

	// ── 3. Interactive selection ────────────────────────────────────────
	const choices = deployments.map((d) => {
		const label = d.id.includes(":") ? d.id.split(":").pop()! : d.id;
		const date = d.createdAt ? style.dim(d.createdAt.slice(0, 10)) : "";
		return {
			name: `${label}  ${date}  ${style.dim(d.url)}`,
			value: d.id,
			checked: pr.state !== "open",
		};
	});

	let selected: string[];
	try {
		selected = await checkbox({
			message: "Select deployments to delete (space to toggle, a to select all, enter to confirm):",
			choices,
		});
	} catch {
		// Ctrl-C
		print(style.dim("Aborted."));
		return { pr, branch, found: deployments.length, deleted: 0, status: "aborted" };
	}

	if (selected.length === 0) {
		print(style.dim("Nothing selected — no deployments deleted."));
		return { pr, branch, found: deployments.length, deleted: 0, status: "aborted" };
	}

	// ── 4. Delete ───────────────────────────────────────────────────────
	print("");
	try {
		const count = await deploy.deletePreviewDeployments(input.project, selected);
		print(style.success(`Deleted ${count} deployment${count === 1 ? "" : "s"}.`));
		return { pr, branch, found: deployments.length, deleted: count, status: "ok" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		print(style.fail(message));
		return { pr, branch, found: deployments.length, deleted: 0, status: "fail", message };
	}
}
