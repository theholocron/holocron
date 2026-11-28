import type { RestClient } from "../utils.js";

/** The lifecycle state of a Vercel deployment; `READY` means it is serving traffic. */
export type VercelDeploymentState = "INITIALIZING" | "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";

/** The environment a deployment is built for. */
export type VercelDeploymentTarget = "production" | "staging";

/** A Vercel deployment as the API returns it. */
export interface VercelDeployment {
	/** The deployment id. */
	id: string;
	/** The deployment's generated hostname, without a scheme. */
	url: string;
	/** Where the deployment is in its lifecycle. */
	readyState: VercelDeploymentState;
	/** The environment the deployment was built for; absent or `null` for a preview. */
	target?: VercelDeploymentTarget | null;
	/**
	 * Metadata on the deployment: what Vercel attaches for a Git deployment (`githubCommitRef`, the branch or ref it was
	 * built from) and whatever the creator set through `deployments.create()`'s `meta`.
	 */
	meta?: Record<string, string | undefined>;
	/** When the deployment was created, in milliseconds since the epoch (the list endpoint returns it). */
	createdAt?: number;
}

/** Input for `deployments.list()`. */
export interface VercelListDeploymentsInput {
	/** Only this project's deployments (its id or name). */
	projectId: string;
	/** Page size; Vercel's own maximum is 100. */
	limit?: number;
	/** Only deployments created before this timestamp (the previous page's `pagination.next`). */
	until?: number;
}

/** One page of `deployments.list()`. */
export interface VercelDeploymentPage {
	deployments: VercelDeployment[];
	/** Where the next page starts (pass it as `until`); `null` or absent on the last page. */
	pagination?: { next?: number | null };
}

/** What `deployments.remove()` answers with. */
export interface VercelDeletedDeployment {
	uid: string;
	state: string;
}

/** Input for `deployments.trigger()`: deploy a branch of a linked GitHub repository. */
export interface VercelTriggerDeploymentInput {
	/** The Vercel project to deploy. */
	projectName: string;
	/** The Git branch (ref) to deploy. */
	branch: string;
	/** The numeric GitHub repository id. */
	repoId: number;
	/** The environment to deploy to; omitted, Vercel decides. */
	target?: VercelDeploymentTarget;
}

/** One file for `deployments.create()` — content is sent inline, base64-encoded. */
export interface VercelDeployFile {
	/** Path relative to the project root, e.g. "api/webhook.js". */
	file: string;
	/** File content, plain text — base64-encoded by `create()` before the request goes out. */
	content: string;
}

/** Input for `deployments.create()`: deploy source files without a Git repository. */
export interface VercelCreateDeploymentInput {
	/** The Vercel project to deploy to. */
	projectName: string;
	/** The files that make up the deployment. */
	files: VercelDeployFile[];
	/**
	 * `projectSettings.framework`. `null` (the default) deploys with no
	 * framework preset — the right choice for a bare serverless function,
	 * not an app. Vercel requires this on a project's first deployment;
	 * later deployments inherit it unless overridden here again.
	 */
	framework?: string | null;
	/**
	 * `projectSettings.installCommand`. Sent explicitly because a deployment made from uploaded
	 * files takes its install command from the project's settings, not from an uploaded
	 * `vercel.json`; omitted, the project's own setting applies.
	 */
	installCommand?: string;
	/** The environment to deploy to; omitted, Vercel decides. */
	target?: VercelDeploymentTarget;
	/** Key-value metadata stored on the deployment: a creator's own tags, read back through `deployments.list()`. */
	meta?: Record<string, string>;
}

export function deployments(rest: RestClient) {
	return {
		trigger: (input: VercelTriggerDeploymentInput): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>("/v13/deployments", {
				method: "POST",
				body: {
					name: input.projectName,
					gitSource: {
						type: "github",
						ref: input.branch,
						repoId: input.repoId,
					},
					...(input.target ? { target: input.target } : {}),
				},
			}),

		/**
		 * Create a deployment directly from source files — no `gitSource`,
		 * no linked repo required. The non-git counterpart to `trigger()`,
		 * for a consumer with no repo to deploy from (a webhook receiver
		 * bundled and shipped as an npm package, for instance).
		 */
		create: (input: VercelCreateDeploymentInput): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>("/v13/deployments", {
				method: "POST",
				body: {
					name: input.projectName,
					files: input.files.map((f) => ({
						file: f.file,
						data: Buffer.from(f.content, "utf8").toString("base64"),
						encoding: "base64",
					})),
					projectSettings: {
						framework: input.framework ?? null,
						...(input.installCommand ? { installCommand: input.installCommand } : {}),
					},
					...(input.target ? { target: input.target } : {}),
					...(input.meta && Object.keys(input.meta).length > 0 ? { meta: input.meta } : {}),
				},
			}),

		/** One page of a project's deployments, newest first, each with its `meta`. */
		list: (input: VercelListDeploymentsInput): Promise<VercelDeploymentPage> =>
			rest.request<VercelDeploymentPage>("/v6/deployments", {
				query: {
					projectId: input.projectId,
					limit: String(input.limit ?? 100),
					...(input.until !== undefined ? { until: String(input.until) } : {}),
				},
			}),

		/** Deletes a deployment. One that is already gone is a `ProviderApiError` with status 404. */
		remove: (deploymentId: string): Promise<VercelDeletedDeployment> =>
			rest.request<VercelDeletedDeployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`, {
				method: "DELETE",
			}),

		get: (deploymentId: string): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
	};
}
