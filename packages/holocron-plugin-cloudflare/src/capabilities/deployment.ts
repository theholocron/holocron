import type {
	Deployment,
	DeploymentProject,
	DeploymentProjectSettings,
	DeploymentRecord,
	DeploymentTarget,
	DeploymentTrigger,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { CfPagesProject } from "@theholocron/cloudflare-client";

import type { CloudflareClient } from "../rest.js";

export class CloudflareDeployment implements Deployment {
	readonly key = "deployment" as const;
	readonly providerName = "cloudflare";

	constructor(
		private readonly client: CloudflareClient,
		private readonly accountId: string
	) {}

	// ── projects ────────────────────────────────────────────────────────

	async listProjects(): Promise<DeploymentProject[]> {
		const projects = await this.client.pages.listProjects(this.accountId);
		return projects.map(mapProject);
	}

	async ensureProject(input: {
		name: string;
		framework?: string;
		repo?: string;
		rootDirectory?: string;
	}): Promise<DeploymentProject> {
		const existing = await this.getProjectByName(input.name);
		if (existing) return existing;

		const created = await this.client.pages.createProject(this.accountId, {
			name: input.name,
			production_branch: "main",
		});
		return mapProject(created);
	}

	async updateProjectSettings(projectId: string, settings: DeploymentProjectSettings): Promise<DeploymentProject> {
		// CF Pages has no direct "disable preview deployments" flag in the REST API;
		// ignore unknown settings and return current project state.
		void settings;
		const project = await this.client.pages.getProject(this.accountId, projectId);
		return mapProject(project);
	}

	// ── env vars ────────────────────────────────────────────────────────

	async listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]> {
		const project = await this.client.pages.getProject(this.accountId, projectId);
		const envConfig = target === "production" ? project.deployment_configs.production : project.deployment_configs.preview;
		return Object.keys(envConfig.env_vars);
	}

	async setEnvVar(projectId: string, target: DeploymentTarget, name: string, value: string): Promise<void> {
		const project = await this.client.pages.getProject(this.accountId, projectId);
		const cfg = project.deployment_configs;
		const scope = target === "production" ? "production" : "preview";
		const updated = {
			...cfg[scope].env_vars,
			[name]: { value, type: "plain_text" as const },
		};
		await this.client.pages.updateProject(this.accountId, projectId, {
			deployment_configs: {
				...cfg,
				[scope]: { env_vars: updated },
			},
		});
	}

	// ── deployments ─────────────────────────────────────────────────────

	async triggerDeployment(input: {
		projectId: string;
		branch: string;
		target?: DeploymentTrigger;
	}): Promise<DeploymentRecord> {
		const raw = await this.client.pages.createDeployment(this.accountId, input.projectId, input.branch);
		// Encode projectId into id so getDeployment can retrieve it without a
		// separate lookup — CF's API requires both projectName and deploymentId.
		return mapDeployment(raw, input.projectId, input.branch, input.target);
	}

	async getDeployment(deploymentId: string): Promise<DeploymentRecord> {
		const sep = deploymentId.indexOf(":");
		if (sep === -1) {
			throw new ProviderApiError(
				`Invalid Cloudflare Pages deployment id "${deploymentId}" — expected "projectName:deploymentId"`,
				400,
				undefined
			);
		}
		const projectName = deploymentId.slice(0, sep);
		const cfDeployId = deploymentId.slice(sep + 1);
		const raw = await this.client.pages.getDeployment(this.accountId, projectName, cfDeployId);
		return mapDeployment(raw, projectName, raw.deployment_trigger.metadata.branch, undefined);
	}

	// ── custom domains ──────────────────────────────────────────────────

	async ensureCustomDomain(projectId: string, hostname: string): Promise<void> {
		const existing = await this.client.pages.listDomains(this.accountId, projectId);
		if (existing.some((d) => d.name === hostname)) return;
		await this.client.pages.addDomain(this.accountId, projectId, hostname);
	}

	// ── internals ───────────────────────────────────────────────────────

	private async getProjectByName(name: string): Promise<DeploymentProject | null> {
		try {
			const result = await this.client.pages.getProject(this.accountId, name);
			return mapProject(result);
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) return null;
			throw err;
		}
	}
}

// ── mappers ──────────────────────────────────────────────────────────

function mapProject(raw: CfPagesProject): DeploymentProject {
	return {
		id: raw.name,
		name: raw.name,
	};
}

type RawDeployment = Awaited<ReturnType<CloudflareClient["pages"]["getDeployment"]>>;

function mapDeployment(
	raw: RawDeployment,
	projectName: string,
	branch: string,
	target: DeploymentTrigger | undefined
): DeploymentRecord {
	const record: DeploymentRecord = {
		// Encode as "projectName:cfDeploymentId" for round-trip lookups.
		id: `${projectName}:${raw.id}`,
		url: raw.url,
		branch,
		status: normalizeStatus(raw.latest_stage.status),
	};
	if (target) record.target = target;
	return record;
}

function normalizeStatus(status: RawDeployment["latest_stage"]["status"]): DeploymentRecord["status"] {
	switch (status) {
		case "idle":
			return "queued";
		case "active":
			return "building";
		case "success":
			return "ready";
		case "failure":
			return "error";
		case "canceled":
			return "cancelled";
		default:
			return "error";
	}
}
