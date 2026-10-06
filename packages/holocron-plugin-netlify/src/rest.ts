/**
 * Thin typed wrapper over Netlify's REST API (`https://api.netlify.com/api/v1`),
 * built on the shared `createRestClient` from `@theholocron/cli` (bearer auth,
 * JSON accept headers, `ProviderApiError` on non-2xx / transport failure) for
 * every JSON endpoint, plus one hand-rolled raw-body call for zip deploys —
 * `createRestClient`'s `request()` always JSON-encodes a given body, which
 * can't carry a binary zip payload.
 *
 * Covers: sites (list/create/get/patch), deploys (zip-upload create, get),
 * and account-scoped environment variables (list/upsert).
 */

import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/cli";

export type { RestClient };

export const DEFAULT_BASE_URL = "https://api.netlify.com/api/v1";

/** Netlify site — the subset of fields Holocron reads/writes. */
export interface NetlifySite {
	id: string;
	name: string;
	url: string;
	ssl_url: string;
	admin_url: string;
	account_id: string;
	account_slug?: string;
	custom_domain?: string | null;
}

/**
 * Netlify deploy. `state` is a free-form string in Netlify's own API (no
 * published enum) — known values seen in practice: `new`, `building`,
 * `uploading`, `uploaded`, `preparing`, `prepared`, `processing`, `ready`,
 * `error`, `retrying`.
 */
export interface NetlifyDeploy {
	id: string;
	site_id: string;
	state: string;
	url: string;
	ssl_url: string;
	deploy_url: string;
	branch: string | null;
	error_message?: string | null;
	created_at: string;
}

export interface NetlifyEnvVarValue {
	id?: string;
	value: string;
	context: "all" | "dev" | "dev-server" | "branch-deploy" | "deploy-preview" | "production" | "branch";
	context_parameter?: string | null;
}

export interface NetlifyEnvVar {
	key: string;
	scopes?: Array<"builds" | "functions" | "runtime" | "post-processing">;
	values: NetlifyEnvVarValue[];
}

export interface NetlifyRestClient extends RestClient {
	/**
	 * `POST /sites/{site_id}/deploys` with `Content-Type: application/zip` —
	 * deploys this exact file tree, no build step run server-side (unlike a
	 * Git-linked deploy). Separate from `request()` because the generic
	 * client always JSON-encodes a given body.
	 */
	uploadZipDeploy(siteId: string, zip: Uint8Array, opts?: { draft?: boolean }): Promise<NetlifyDeploy>;
}

export function createNetlifyRestClient(opts: {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): NetlifyRestClient {
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const fetchImpl = opts.fetch ?? globalThis.fetch;
	const rest = createRestClient({
		baseUrl,
		token: opts.token,
		vendor: "Netlify",
		fetch: opts.fetch,
	});

	return {
		...rest,

		async uploadZipDeploy(siteId, zip, deployOpts = {}) {
			let trimmedBase = baseUrl;
			while (trimmedBase.endsWith("/")) trimmedBase = trimmedBase.slice(0, -1);
			const url = new URL(`${trimmedBase}/sites/${encodeURIComponent(siteId)}/deploys`);
			if (deployOpts.draft) url.searchParams.set("draft", "true");

			const tag = `Netlify POST /sites/${siteId}/deploys`;
			let res: Response;
			try {
				res = await fetchImpl(url.toString(), {
					method: "POST",
					headers: {
						authorization: `Bearer ${opts.token}`,
						accept: "application/json",
						"content-type": "application/zip",
					},
					body: zip,
				});
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`${tag} failed: ${detail}`, 0, undefined);
			}

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new ProviderApiError(`${tag} → ${res.status}`, res.status, body);
			}
			return (await res.json()) as NetlifyDeploy;
		},
	};
}
