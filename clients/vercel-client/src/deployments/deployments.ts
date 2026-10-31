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
	/** Git metadata Vercel attaches to the deployment. */
	meta?: {
		/** The branch or ref the deployment was built from. */
		githubCommitRef?: string;
	};
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
	/** The environment to deploy to; omitted, Vercel decides. */
	target?: VercelDeploymentTarget;
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
					projectSettings: { framework: input.framework ?? null },
					...(input.target ? { target: input.target } : {}),
				},
			}),

		get: (deploymentId: string): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
	};
}
