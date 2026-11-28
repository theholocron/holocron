import { deployments } from "./deployments/deployments.js";
import { domains } from "./domains/domains.js";
import { env } from "./env/env.js";
import { projects } from "./projects/projects.js";
import { user } from "./user/user.js";
import { createVercelRestClient, type VercelClientOptions } from "./utils.js";
import { webhooks } from "./webhooks/webhooks.js";

export type {
	VercelCreateDeploymentInput,
	VercelDeployFile,
	VercelDeployment,
	VercelDeploymentState,
	VercelDeploymentTarget,
	VercelTriggerDeploymentInput,
} from "./deployments/deployments.js";
export type {
	VercelAddDomainResult,
	VercelDomain,
	VercelDomainConfig,
	VercelDomainConfigRecommendation,
	VercelDomainsResponse,
	VercelDomainVerification,
} from "./domains/domains.js";
export type { VercelEnvTarget, VercelEnvVar, VercelEnvVarsResponse } from "./env/env.js";
export type {
	VercelCreateProjectInput,
	VercelProject,
	VercelProjectLink,
	VercelProjectsResponse,
	VercelUpdateProjectInput,
} from "./projects/projects.js";
export type { VercelUser, VercelUserResponse } from "./user/user.js";
export type { VercelClientOptions } from "./utils.js";
export type { VercelCreatedWebhook, VercelCreateWebhookInput, VercelWebhook } from "./webhooks/webhooks.js";

/** Create a Vercel client with `deployments`, `domains`, `env`, `projects`, `user` and `webhooks` groups, all sharing one REST client built from `opts`. */
export function createVercelClient(opts: VercelClientOptions) {
	const rest = createVercelRestClient(opts);
	return {
		deployments: deployments(rest),
		domains: domains(rest),
		env: env(rest),
		projects: projects(rest),
		user: user(rest),
		webhooks: webhooks(rest),
	};
}

/** The client `createVercelClient()` returns. */
export type VercelClient = ReturnType<typeof createVercelClient>;
