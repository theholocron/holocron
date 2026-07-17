import type { RestClient } from "../utils.js";

export interface DopplerSecretValue {
	raw?: string;
	computed?: string;
}

export interface DopplerSecret {
	name?: string;
	value?: DopplerSecretValue | null;
}

export interface DopplerSecretsMap {
	secrets?: Record<string, DopplerSecretValue | null>;
}

export function secrets(rest: RestClient) {
	return {
		get: (
			project: string,
			config: string,
			name: string,
		): Promise<DopplerSecret> =>
			rest.request<DopplerSecret>("/configs/config/secret", {
				query: { project, config, name },
			}),

		list: (project: string, config: string): Promise<DopplerSecretsMap> =>
			rest.request<DopplerSecretsMap>("/configs/config/secrets", {
				query: { project, config },
			}),

		update: (
			project: string,
			config: string,
			values: Record<string, string>,
		): Promise<DopplerSecretsMap> =>
			rest.request<DopplerSecretsMap>("/configs/config/secrets", {
				method: "POST",
				body: { project, config, secrets: values },
			}),

		download: (
			project: string,
			config: string,
		): Promise<Record<string, string>> =>
			rest.request<Record<string, string>>(
				"/configs/config/secrets/download",
				{ query: { project, config, format: "json" } },
			),
	};
}
