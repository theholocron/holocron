import type { RestClient } from "../utils.js";

/** A secret's value in its two forms. */
export interface DopplerSecretValue {
	/** The value as stored, with references such as `${OTHER}` left unexpanded. */
	raw?: string;
	/** The value with references expanded. */
	computed?: string;
}

/** One secret, as returned when reading it by name. */
export interface DopplerSecret {
	/** The secret's name. */
	name?: string;
	/** The secret's value; `null` or `undefined` when it has none. */
	value?: DopplerSecretValue | null;
}

/** The secrets of a config, keyed by name. */
export interface DopplerSecretsMap {
	/** Each secret's value by name; a secret with no value is `null`. */
	secrets?: Record<string, DopplerSecretValue | null>;
}

export function secrets(rest: RestClient) {
	return {
		get: (project: string, config: string, name: string): Promise<DopplerSecret> =>
			rest.request<DopplerSecret>("/configs/config/secret", {
				query: { project, config, name },
			}),

		list: (project: string, config: string): Promise<DopplerSecretsMap> =>
			rest.request<DopplerSecretsMap>("/configs/config/secrets", {
				query: { project, config },
			}),

		update: (project: string, config: string, values: Record<string, string>): Promise<DopplerSecretsMap> =>
			rest.request<DopplerSecretsMap>("/configs/config/secrets", {
				method: "POST",
				body: { project, config, secrets: values },
			}),

		download: (project: string, config: string): Promise<Record<string, string>> =>
			rest.request<Record<string, string>>("/configs/config/secrets/download", {
				query: { project, config, format: "json" },
			}),
	};
}
