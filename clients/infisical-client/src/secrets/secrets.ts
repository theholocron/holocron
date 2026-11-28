import type { RestClient } from "../utils.js";

/** A secret as the Infisical API returns it. */
export interface InfisicalSecret {
	/** The secret's name. */
	secretKey?: string;
	/** The secret's value in plain text. */
	secretValue?: string;
}

/** The response of listing secrets. */
export interface InfisicalSecretsListResponse {
	/** The secrets in the requested scope. */
	secrets?: InfisicalSecret[];
}

/** The response of reading one secret. */
export interface InfisicalSecretResponse {
	/** The secret that was read. */
	secret?: InfisicalSecret;
}

/** Where a secret lives: a workspace, an environment and a folder path. */
export interface InfisicalSecretScope {
	/** The id of the workspace (project) that holds the secret. */
	workspaceId: string;
	/** The slug of the environment, such as `dev` or `prod`. */
	environment: string;
	/** The folder path inside the environment; left out, `/` is used. */
	secretPath?: string;
}

/** What to create a secret with, on top of its scope. */
export interface InfisicalCreateSecretInput extends InfisicalSecretScope {
	/** The value to store. */
	secretValue: string;
	/** Whether the secret is `"shared"` or `"personal"`; left out, `"shared"` is sent. */
	type?: "shared" | "personal";
}

/** What to update a secret with, on top of its scope. */
export interface InfisicalUpdateSecretInput extends InfisicalSecretScope {
	/** The new value to store. */
	secretValue: string;
}

export function secrets(rest: RestClient) {
	return {
		list: (scope: InfisicalSecretScope): Promise<InfisicalSecretsListResponse> => {
			const query: Record<string, string> = {
				workspaceId: scope.workspaceId,
				environment: scope.environment,
				secretPath: scope.secretPath ?? "/",
			};
			return rest.request<InfisicalSecretsListResponse>("/v3/secrets/raw", { query });
		},

		get: (name: string, scope: InfisicalSecretScope): Promise<InfisicalSecretResponse> => {
			const query: Record<string, string> = {
				workspaceId: scope.workspaceId,
				environment: scope.environment,
				secretPath: scope.secretPath ?? "/",
			};
			return rest.request<InfisicalSecretResponse>(`/v3/secrets/raw/${encodeURIComponent(name)}`, { query });
		},

		create: (name: string, input: InfisicalCreateSecretInput): Promise<unknown> =>
			rest.request<unknown>(`/v3/secrets/raw/${encodeURIComponent(name)}`, {
				method: "POST",
				body: {
					workspaceId: input.workspaceId,
					environment: input.environment,
					secretPath: input.secretPath ?? "/",
					secretValue: input.secretValue,
					type: input.type ?? "shared",
				},
			}),

		update: (name: string, input: InfisicalUpdateSecretInput): Promise<unknown> =>
			rest.request<unknown>(`/v3/secrets/raw/${encodeURIComponent(name)}`, {
				method: "PATCH",
				body: {
					workspaceId: input.workspaceId,
					environment: input.environment,
					secretPath: input.secretPath ?? "/",
					secretValue: input.secretValue,
				},
			}),
	};
}
