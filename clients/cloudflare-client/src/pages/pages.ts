import { cfRequest, type RestClient } from "../utils.js";

/** How a Pages environment variable is stored: as plain text or as an encrypted secret. */
export type CfPagesEnvVarType = "plain_text" | "secret_text";

/** An environment variable on a Pages project. */
export interface CfPagesEnvVar {
	/** The variable's value. */
	value: string;
	/** Whether the variable is plain text or a secret. */
	type: CfPagesEnvVarType;
}

/** The configuration of one Pages deployment environment. */
export interface CfPagesEnvConfig {
	/** The environment variables, keyed by name. */
	env_vars: Record<string, CfPagesEnvVar>;
}

/** A Cloudflare Pages project. */
export interface CfPagesProject {
	/** The project's identifier. */
	id: string;
	/** The project's name. */
	name: string;
	/** The project's `pages.dev` subdomain. */
	subdomain: string;
	/** The domains the project is served on. */
	domains: string[];
	/** The branch that deploys to production. */
	production_branch: string;
	/** The per-environment deployment configuration. */
	deployment_configs: {
		/** The configuration used for preview deployments. */
		preview: CfPagesEnvConfig;
		/** The configuration used for production deployments. */
		production: CfPagesEnvConfig;
	};
}

/** The fields for creating a Pages project. */
export interface CfPagesProjectInput {
	/** The project's name. */
	name: string;
	/** The branch that deploys to production. */
	production_branch: string;
}

/** One stage of a Pages deployment. */
export interface CfPagesDeploymentStage {
	/** The stage's name. */
	name: string;
	/** The stage's status. */
	status: "idle" | "active" | "canceled" | "success" | "failure";
}

/** A custom domain attached to a Pages project. */
export interface CfPagesDomain {
	/** The domain's identifier. */
	id: string;
	/** The domain's hostname. */
	name: string;
	/** The domain's verification and certificate status. */
	status: "active" | "pending" | "blocked" | "error" | "moved" | "pending_tls";
}

/** A deployment of a Pages project. */
export interface CfPagesDeployment {
	/** The deployment's identifier. */
	id: string;
	/** The URL the deployment is served at. */
	url: string;
	/** The environment the deployment belongs to. */
	environment: "preview" | "production";
	/** What triggered the deployment. */
	deployment_trigger: {
		/** The kind of trigger. */
		type: string;
		/** Details of the commit that triggered the deployment. */
		metadata: {
			/** The branch that was deployed. */
			branch: string;
			/** The commit that was deployed. */
			commit_hash: string;
		};
	};
	/** The deployment's most recent stage. */
	latest_stage: CfPagesDeploymentStage;
	/** When the deployment was created, as an ISO 8601 string. */
	created_on: string;
}

export function pages(rest: RestClient) {
	return {
		// Unlike most Cloudflare v4 list endpoints, Pages' project list rejects
		// the request outright (error 8000024, "Invalid list options provided")
		// whenever `per_page` is present at all, regardless of its value —
		// confirmed against the live API. `page` alone is accepted; omitting
		// both entirely also works and returns every project in one response.
		listProjects: (accountId: string): Promise<CfPagesProject[]> =>
			cfRequest<CfPagesProject[]>(rest, "GET", `/accounts/${accountId}/pages/projects`),

		getProject: (accountId: string, name: string): Promise<CfPagesProject> =>
			cfRequest<CfPagesProject>(rest, "GET", `/accounts/${accountId}/pages/projects/${name}`),

		createProject: (accountId: string, input: CfPagesProjectInput): Promise<CfPagesProject> =>
			cfRequest<CfPagesProject>(rest, "POST", `/accounts/${accountId}/pages/projects`, input),

		updateProject: (
			accountId: string,
			name: string,
			patch: Partial<Pick<CfPagesProject, "deployment_configs" | "production_branch">>
		): Promise<CfPagesProject> =>
			cfRequest<CfPagesProject>(rest, "PATCH", `/accounts/${accountId}/pages/projects/${name}`, patch),

		createDeployment: (accountId: string, projectName: string, branch: string): Promise<CfPagesDeployment> =>
			cfRequest<CfPagesDeployment>(
				rest,
				"POST",
				`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
				{ branch }
			),

		getDeployment: (accountId: string, projectName: string, deploymentId: string): Promise<CfPagesDeployment> =>
			cfRequest<CfPagesDeployment>(
				rest,
				"GET",
				`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`
			),

		listDeployments: (accountId: string, projectName: string): Promise<CfPagesDeployment[]> =>
			cfRequest<CfPagesDeployment[]>(
				rest,
				"GET",
				`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
				undefined,
				{ per_page: "25" }
			),

		deleteDeployment: (accountId: string, projectName: string, deploymentId: string): Promise<void> =>
			cfRequest<void>(
				rest,
				"DELETE",
				`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
				undefined,
				{ force: "true" }
			),

		listDomains: (accountId: string, projectName: string): Promise<CfPagesDomain[]> =>
			cfRequest<CfPagesDomain[]>(rest, "GET", `/accounts/${accountId}/pages/projects/${projectName}/domains`),

		addDomain: (accountId: string, projectName: string, hostname: string): Promise<CfPagesDomain> =>
			cfRequest<CfPagesDomain>(rest, "POST", `/accounts/${accountId}/pages/projects/${projectName}/domains`, {
				name: hostname,
			}),
	};
}
