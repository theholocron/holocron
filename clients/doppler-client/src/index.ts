import { createDopplerRestClient, type DopplerClientOptions } from "./utils.js";
import { environments } from "./environments/environments.js";
import { me } from "./me/me.js";
import { projects } from "./projects/projects.js";
import { secrets } from "./secrets/secrets.js";

export type { DopplerClientOptions } from "./utils.js";

export type {
	DopplerEnvironment,
	DopplerEnvironmentsResponse,
} from "./environments/environments.js";
export type { DopplerMe } from "./me/me.js";
export type {
	DopplerProject,
	DopplerProjectResponse,
} from "./projects/projects.js";
export type {
	DopplerSecret,
	DopplerSecretValue,
	DopplerSecretsMap,
} from "./secrets/secrets.js";

export function createDopplerClient(opts: DopplerClientOptions) {
	const rest = createDopplerRestClient(opts);
	return {
		environments: environments(rest),
		me: me(rest),
		projects: projects(rest),
		secrets: secrets(rest),
	};
}

export type DopplerClient = ReturnType<typeof createDopplerClient>;
