import { ProviderApiError } from "@theholocron/http-client";

import type { RestClient } from "../utils.js";
import { buildZip } from "../zip.js";

/**
 * Netlify deploy. `state` is a free-form string in Netlify's own API (no
 * published enum) — known values seen in practice: `new`, `building`,
 * `uploading`, `uploaded`, `preparing`, `prepared`, `processing`, `ready`,
 * `error`, `retrying`, `current`.
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

/** Raw transport details `createFromZip` needs beyond the generic `RestClient` — it sends a binary body, which `RestClient.request()` can't carry (always JSON-encodes a given body). */
export interface NetlifyRawTransport {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

export function deploys(rest: RestClient, raw: NetlifyRawTransport) {
	return {
		get: (deployId: string): Promise<NetlifyDeploy> =>
			rest.request<NetlifyDeploy>(`/deploys/${encodeURIComponent(deployId)}`),

		/**
		 * Zips `files` (plain text) and uploads as a one-shot deploy via
		 * `POST /sites/{id}/deploys` with `Content-Type: application/zip`.
		 * Netlify runs no build step for a raw zip upload (unlike a
		 * Git-linked deploy) — the caller is responsible for having already
		 * resolved dependencies into the file set.
		 */
		async createFromZip(
			siteId: string,
			files: Record<string, string>,
			opts: { draft?: boolean } = {}
		): Promise<NetlifyDeploy> {
			const fetchImpl = raw.fetch ?? globalThis.fetch;
			let baseUrl = raw.baseUrl ?? "https://api.netlify.com/api/v1";
			while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
			const url = new URL(`${baseUrl}/sites/${encodeURIComponent(siteId)}/deploys`);
			if (opts.draft) url.searchParams.set("draft", "true");

			const zip = buildZip(files);
			const tag = `Netlify POST /sites/${siteId}/deploys`;
			let res: Response;
			try {
				res = await fetchImpl(url.toString(), {
					method: "POST",
					headers: {
						authorization: `Bearer ${raw.token}`,
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
