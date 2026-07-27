import { secrets } from "./secrets/secrets.js";
import {
	createInfisicalRestClient,
	type InfisicalClientOptions,
} from "./utils.js";
import { workspaces } from "./workspaces/workspaces.js";

export type {
	InfisicalCreateSecretInput,
	InfisicalSecret,
	InfisicalSecretResponse,
	InfisicalSecretScope,
	InfisicalSecretsListResponse,
	InfisicalUpdateSecretInput,
} from "./secrets/secrets.js";
export type { InfisicalClientOptions } from "./utils.js";
export type {
	InfisicalWorkspace,
	InfisicalWorkspaceDetails,
	InfisicalWorkspaceDetailsResponse,
	InfisicalWorkspaceEnvironment,
	InfisicalWorkspaceListResponse,
} from "./workspaces/workspaces.js";

export function createInfisicalClient(opts: InfisicalClientOptions) {
	const rest = createInfisicalRestClient(opts);
	return {
		secrets: secrets(rest),
		workspaces: workspaces(rest),
	};
}

export type InfisicalClient = ReturnType<typeof createInfisicalClient>;
