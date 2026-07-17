import {
	createInfisicalRestClient,
	type InfisicalClientOptions,
} from "./utils.js";
import { secrets } from "./secrets/secrets.js";
import { workspaces } from "./workspaces/workspaces.js";

export type { InfisicalClientOptions } from "./utils.js";

export type {
	InfisicalSecret,
	InfisicalSecretsListResponse,
	InfisicalSecretResponse,
	InfisicalSecretScope,
	InfisicalCreateSecretInput,
	InfisicalUpdateSecretInput,
} from "./secrets/secrets.js";
export type {
	InfisicalWorkspace,
	InfisicalWorkspaceEnvironment,
	InfisicalWorkspaceDetails,
	InfisicalWorkspaceListResponse,
	InfisicalWorkspaceDetailsResponse,
} from "./workspaces/workspaces.js";

export function createInfisicalClient(opts: InfisicalClientOptions) {
	const rest = createInfisicalRestClient(opts);
	return {
		secrets: secrets(rest),
		workspaces: workspaces(rest),
	};
}

export type InfisicalClient = ReturnType<typeof createInfisicalClient>;
