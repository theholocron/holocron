/**
 * `deployment` capability for Vercel.
 *
 * Ported from rando-id/rando.id `packages/cli/src/adapters/vercel.ts`,
 * adapted to the holocron `Deployment` interface:
 *
 *   - `ensureProject` is the idempotent create (GET-then-POST), since
 *     `holocron setup` re-runs on every invocation
 *   - `setEnvVar` uses Vercel's `upsert=true` so it's idempotent
 *     create-or-update
 *   - `triggerDeployment` infers a branch preview when `target` is
 *     omitted; named targets ('production' / 'staging') opt into
 *     environment-scoped deploys
 *
 * Vercel encrypts env-var values at rest server-side; we send them as
 * `type: 'encrypted'`. Unlike GitHub Actions secrets, there's no
 * sealed-box / libsodium step on the client.
 */

import { ProviderApiError } from "@theholocron/cli";
import type {
	Deployment,
	DeploymentProject,
	DeploymentProjectSettings,
	DeploymentRecord,
	DeploymentTarget,
	DeploymentTrigger,
} from "@theholocron/cli";
import type { VercelClient, VercelProject } from "@theholocron/vercel-client";

export interface DeploymentOptions {
	/** Optional framework hint passed to project creates. Defaults to "nextjs". */
	defaultFramework?: string;
}

export class VercelDeployment implements Deployment {
	readonly key = "deployment" as const;
	readonly providerName = "vercel";

	private readonly defaultFramework: string;

	constructor(
		private readonly client: VercelClient,
		opts: DeploymentOptions = {}
	) {
		this.defaultFramework = opts.defaultFramework ?? "nextjs";
	}

	// ── projects ────────────────────────────────────────────────────────

	async listProjects(): Promise<DeploymentProject[]> {
		const { projects } = await this.client.projects.list();
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

		const result = await this.client.projects.create({
			name: input.name,
			framework: input.framework ?? this.defaultFramework,
			repo: input.repo,
			rootDirectory: input.rootDirectory,
		});
		return mapProject(result);
	}

	async updateProjectSettings(projectId: string, settings: DeploymentProjectSettings): Promise<DeploymentProject> {
		const result = await this.client.projects.update(projectId, {
			previewDeploymentsDisabled: settings.previewDeploymentsDisabled,
			// createDeployments accepts boolean at runtime; client type is narrower than needed
			gitProviderOptions: settings.gitProviderCreateDeployments !== undefined
				? ({ createDeployments: settings.gitProviderCreateDeployments } as unknown as { createDeployments?: string })
				: undefined,
		});
		return mapProject(result);
	}

	// ── env vars ────────────────────────────────────────────────────────

	async listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]> {
		const { envs } = await this.client.env.list(projectId);
		return envs
			.filter((e) => e.target.includes(target as "production" | "preview" | "development"))
			.map((e) => e.key);
	}

	async setEnvVar(projectId: string, target: DeploymentTarget, name: string, value: string): Promise<void> {
		await this.client.env.set(projectId, target as "production" | "preview" | "development", name, value);
	}

	// ── deployments ─────────────────────────────────────────────────────

	async triggerDeployment(input: {
		projectId: string;
		branch: string;
		target?: DeploymentTrigger;
	}): Promise<DeploymentRecord> {
		const project = await this.client.projects.get(input.projectId);
		const repoId = project.link?.repoId;
		if (!repoId) {
			throw new ProviderApiError(
				`Vercel project "${project.name}" has no linked GitHub repo — cannot trigger a deployment. Link the repo first.`,
				400,
				undefined
			);
		}
		const raw = await this.client.deployments.trigger({
			projectName: project.name,
			branch: input.branch,
			repoId,
			target: input.target as "production" | "staging" | undefined,
		});
		return mapDeployment(raw, input.branch);
	}

	async getDeployment(deploymentId: string): Promise<DeploymentRecord> {
		const raw = await this.client.deployments.get(deploymentId);
		return mapDeployment(raw, raw.meta?.githubCommitRef ?? null);
	}

	// ── internals ───────────────────────────────────────────────────────

	private async getProjectByName(name: string): Promise<DeploymentProject | null> {
		try {
			const result = await this.client.projects.get(name);
			return mapProject(result);
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) return null;
			throw err;
		}
	}
}

// ── mappers ──────────────────────────────────────────────────────────

function mapProject(raw: VercelProject): DeploymentProject {
	const project: DeploymentProject = {
		id: raw.id,
		name: raw.name,
		gitLinked: Boolean(raw.link?.repoId),
		rootDirectory: raw.rootDirectory ?? null,
	};
	if (raw.framework) project.framework = raw.framework;
	return project;
}

type RawDeployment = Awaited<ReturnType<VercelClient["deployments"]["get"]>>;

function mapDeployment(raw: RawDeployment, branch: string | null): DeploymentRecord {
	const record: DeploymentRecord = {
		id: raw.id,
		url: raw.url,
		branch,
		status: normalizeState(raw.readyState),
	};
	if (raw.target) record.target = raw.target as DeploymentTrigger;
	return record;
}

function normalizeState(s: RawDeployment["readyState"]): DeploymentRecord["status"] {
	switch (s) {
		case "INITIALIZING":
		case "QUEUED":
			return "queued";
		case "BUILDING":
			return "building";
		case "READY":
			return "ready";
		case "ERROR":
			return "error";
		case "CANCELED":
			return "cancelled";
	}
}
