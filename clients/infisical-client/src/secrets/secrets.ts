import type { RestClient } from "../utils.js";

export interface InfisicalSecret {
	secretKey?: string;
	secretValue?: string;
}

export interface InfisicalSecretsListResponse {
	secrets?: InfisicalSecret[];
}

export interface InfisicalSecretResponse {
	secret?: InfisicalSecret;
}

export interface InfisicalSecretScope {
	workspaceId: string;
	environment: string;
	secretPath?: string;
}

export interface InfisicalCreateSecretInput extends InfisicalSecretScope {
	secretValue: string;
	type?: "shared" | "personal";
}

export interface InfisicalUpdateSecretInput extends InfisicalSecretScope {
	secretValue: string;
}

export function secrets(rest: RestClient) {
	return {
		list: (
			scope: InfisicalSecretScope,
		): Promise<InfisicalSecretsListResponse> => {
			const query: Record<string, string> = {
				workspaceId: scope.workspaceId,
				environment: scope.environment,
				secretPath: scope.secretPath ?? "/",
			};
			return rest.request<InfisicalSecretsListResponse>(
				"/v3/secrets/raw",
				{ query },
			);
		},

		get: (
			name: string,
			scope: InfisicalSecretScope,
		): Promise<InfisicalSecretResponse> => {
			const query: Record<string, string> = {
				workspaceId: scope.workspaceId,
				environment: scope.environment,
				secretPath: scope.secretPath ?? "/",
			};
			return rest.request<InfisicalSecretResponse>(
				`/v3/secrets/raw/${encodeURIComponent(name)}`,
				{ query },
			);
		},

		create: (
			name: string,
			input: InfisicalCreateSecretInput,
		): Promise<unknown> =>
			rest.request<unknown>(
				`/v3/secrets/raw/${encodeURIComponent(name)}`,
				{
					method: "POST",
					body: {
						workspaceId: input.workspaceId,
						environment: input.environment,
						secretPath: input.secretPath ?? "/",
						secretValue: input.secretValue,
						type: input.type ?? "shared",
					},
				},
			),

		update: (
			name: string,
			input: InfisicalUpdateSecretInput,
		): Promise<unknown> =>
			rest.request<unknown>(
				`/v3/secrets/raw/${encodeURIComponent(name)}`,
				{
					method: "PATCH",
					body: {
						workspaceId: input.workspaceId,
						environment: input.environment,
						secretPath: input.secretPath ?? "/",
						secretValue: input.secretValue,
					},
				},
			),
	};
}
