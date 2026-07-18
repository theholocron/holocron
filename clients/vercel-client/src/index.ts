import { createVercelRestClient, type VercelClientOptions } from "./utils.js";
import { deployments } from "./deployments/deployments.js";
import { env } from "./env/env.js";
import { projects } from "./projects/projects.js";
import { user } from "./user/user.js";

export type { VercelClientOptions } from "./utils.js";

export type {
	VercelDeployment,
	VercelDeploymentState,
	VercelDeploymentTarget,
	VercelTriggerDeploymentInput,
} from "./deployments/deployments.js";
export type {
	VercelEnvTarget,
	VercelEnvVar,
	VercelEnvVarsResponse,
} from "./env/env.js";
export type {
	VercelProject,
	VercelProjectLink,
	VercelProjectsResponse,
	VercelCreateProjectInput,
	VercelUpdateProjectInput,
} from "./projects/projects.js";
export type { VercelUser, VercelUserResponse } from "./user/user.js";

export function createVercelClient(opts: VercelClientOptions) {
	const rest = createVercelRestClient(opts);
	return {
		deployments: deployments(rest),
		env: env(rest),
		projects: projects(rest),
		user: user(rest),
	};
}

export type VercelClient = ReturnType<typeof createVercelClient>;
