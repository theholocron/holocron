import { secrets } from "./secrets/secrets.js";
import { createInfisicalRestClient, type InfisicalClientOptions } from "./utils.js";
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

/** Creates an Infisical API client with `secrets` and `workspaces` groups, all sharing one REST client. */
export function createInfisicalClient(opts: InfisicalClientOptions) {
	const rest = createInfisicalRestClient(opts);
	return {
		secrets: secrets(rest),
		workspaces: workspaces(rest),
	};
}

/** The client `createInfisicalClient` returns. */
export type InfisicalClient = ReturnType<typeof createInfisicalClient>;
