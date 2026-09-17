import type { RestClient } from "../utils.js";

export type VercelDeploymentState = "INITIALIZING" | "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";

export type VercelDeploymentTarget = "production" | "staging";

export interface VercelDeployment {
	id: string;
	url: string;
	readyState: VercelDeploymentState;
	target?: VercelDeploymentTarget | null;
	meta?: { githubCommitRef?: string };
}

export interface VercelTriggerDeploymentInput {
	projectName: string;
	branch: string;
	repoId: number;
	target?: VercelDeploymentTarget;
}

/** One file for `deployments.create()` — content is sent inline, base64-encoded. */
export interface VercelDeployFile {
	/** Path relative to the project root, e.g. "api/webhook.js". */
	file: string;
	/** File content, plain text — base64-encoded by `create()` before the request goes out. */
	content: string;
}

export interface VercelCreateDeploymentInput {
	projectName: string;
	files: VercelDeployFile[];
	/**
	 * `projectSettings.framework`. `null` (the default) deploys with no
	 * framework preset — the right choice for a bare serverless function,
	 * not an app. Vercel requires this on a project's first deployment;
	 * later deployments inherit it unless overridden here again.
	 */
	framework?: string | null;
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
