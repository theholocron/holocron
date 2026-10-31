import type { RestClient } from "../utils.js";

/** The deploy contexts an environment variable value can apply to. */
export type NetlifyEnvContext =
	"all" | "dev" | "dev-server" | "branch-deploy" | "deploy-preview" | "production" | "branch";

/** One value of an environment variable, for one deploy context. */
export interface NetlifyEnvVarValue {
	/** The value's id. */
	id?: string;
	/** The variable's value in this context. */
	value: string;
	/** The deploy context the value applies to. */
	context: NetlifyEnvContext;
	/** The branch name, when `context` is `"branch"`. */
	context_parameter?: string | null;
}

/** An environment variable on a site, with its values per context. */
export interface NetlifyEnvVar {
	/** The variable's name. */
	key: string;
	/** Where the variable is available. */
	scopes?: Array<"builds" | "functions" | "runtime" | "post-processing">;
	/** The variable's values, one per context. */
	values: NetlifyEnvVarValue[];
}

export function env(rest: RestClient) {
	const list = (accountId: string, siteId: string): Promise<NetlifyEnvVar[]> =>
		rest.request<NetlifyEnvVar[]>(`/accounts/${encodeURIComponent(accountId)}/env`, {
			query: { site_id: siteId },
		});

	return {
		list,

		/**
		 * Upsert one value for one context on one key. Netlify's env API has
		 * no single "upsert a value" endpoint — `PUT /env/{key}` replaces the
		 * entire `values` array, and there's no documented "get one key"
		 * endpoint either (only list + PUT/DELETE by key) — so a genuine
		 * upsert needs the key's current full value list first.
		 */
		async set(
			accountId: string,
			siteId: string,
			key: string,
			context: NetlifyEnvContext,
			value: string
		): Promise<void> {
			const query = { site_id: siteId };
			const existing = (await list(accountId, siteId)).find((v) => v.key === key);

			if (!existing) {
				await rest.request(`/accounts/${encodeURIComponent(accountId)}/env`, {
					method: "POST",
					query,
					body: { key, scopes: ["functions", "runtime"], values: [{ value, context }] },
				});
				return;
			}

			const values = existing.values.filter((v) => v.context !== context);
			values.push({ value, context });
			await rest.request(`/accounts/${encodeURIComponent(accountId)}/env/${encodeURIComponent(key)}`, {
				method: "PUT",
				query,
				body: { key, scopes: existing.scopes ?? ["functions", "runtime"], values },
			});
		},
	};
}
