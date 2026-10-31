import { environments } from "./environments/environments.js";
import { me } from "./me/me.js";
import { projects } from "./projects/projects.js";
import { secrets } from "./secrets/secrets.js";
import { createDopplerRestClient, type DopplerClientOptions } from "./utils.js";

export type { DopplerEnvironment, DopplerEnvironmentsResponse } from "./environments/environments.js";
export type { DopplerMe } from "./me/me.js";
export type { DopplerProject, DopplerProjectResponse } from "./projects/projects.js";
export type { DopplerSecret, DopplerSecretsMap, DopplerSecretValue } from "./secrets/secrets.js";
export type { DopplerClientOptions } from "./utils.js";

/** Creates a Doppler API client with `environments`, `me`, `projects` and `secrets` groups, all sharing one REST client. */
export function createDopplerClient(opts: DopplerClientOptions) {
	const rest = createDopplerRestClient(opts);
	return {
		environments: environments(rest),
		me: me(rest),
		projects: projects(rest),
		secrets: secrets(rest),
	};
}

/** The client `createDopplerClient` returns. */
export type DopplerClient = ReturnType<typeof createDopplerClient>;
