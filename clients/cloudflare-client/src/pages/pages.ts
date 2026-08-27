import { cfRequest, type RestClient } from "../utils.js";

export type CfPagesEnvVarType = "plain_text" | "secret_text";

export interface CfPagesEnvVar {
	value: string;
	type: CfPagesEnvVarType;
}

export interface CfPagesEnvConfig {
	env_vars: Record<string, CfPagesEnvVar>;
}

export interface CfPagesProject {
	id: string;
	name: string;
	subdomain: string;
	domains: string[];
	production_branch: string;
	deployment_configs: {
		preview: CfPagesEnvConfig;
		production: CfPagesEnvConfig;
	};
}

export interface CfPagesProjectInput {
	name: string;
	production_branch: string;
}

export interface CfPagesDeploymentStage {
	name: string;
	status: "idle" | "active" | "canceled" | "success" | "failure";
}

export interface CfPagesDomain {
	id: string;
	name: string;
	status: "active" | "pending" | "blocked" | "error" | "moved" | "pending_tls";
}

export interface CfPagesDeployment {
	id: string;
	url: string;
	environment: "preview" | "production";
	deployment_trigger: {
		type: string;
		metadata: {
			branch: string;
			commit_hash: string;
		};
	};
	latest_stage: CfPagesDeploymentStage;
	created_on: string;
}

export function pages(rest: RestClient) {
	return {
		listProjects: (accountId: string): Promise<CfPagesProject[]> =>
			cfRequest<CfPagesProject[]>(rest, "GET", `/accounts/${accountId}/pages/projects`, undefined, {
				per_page: "100",
			}),

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

		listDomains: (accountId: string, projectName: string): Promise<CfPagesDomain[]> =>
			cfRequest<CfPagesDomain[]>(rest, "GET", `/accounts/${accountId}/pages/projects/${projectName}/domains`),

		addDomain: (accountId: string, projectName: string, hostname: string): Promise<CfPagesDomain> =>
			cfRequest<CfPagesDomain>(rest, "POST", `/accounts/${accountId}/pages/projects/${projectName}/domains`, {
				name: hostname,
			}),
	};
}
