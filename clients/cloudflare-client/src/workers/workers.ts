import { ProviderApiError } from "@theholocron/http-client";

import { cfRequest, type CloudflareClientOptions, type RestClient } from "../utils.js";

export interface CfWorkerRoute {
	id: string;
	pattern: string;
	script: string | null;
}

export function workers(rest: RestClient, opts: CloudflareClientOptions) {
	const baseUrl = opts.baseUrl ?? "https://api.cloudflare.com/client/v4";
	const fetchImpl = opts.fetch ?? globalThis.fetch;

	return {
		// Script management — account-scoped, requires multipart/form-data.
		putScript: async (accountId: string, scriptName: string, script: string): Promise<void> => {
			const form = new FormData();
			form.append(
				"metadata",
				new Blob([JSON.stringify({ main_module: "index.js", compatibility_date: "2025-08-31" })], {
					type: "application/json",
				})
			);
			form.append("index.js", new Blob([script], { type: "application/javascript+module" }), "index.js");

			const path = `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}`;
			const res = await fetchImpl(`${baseUrl}${path}`, {
				method: "PUT",
				headers: { authorization: `Bearer ${opts.token}` },
				body: form,
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new ProviderApiError(`Cloudflare PUT ${path} → ${res.status}`, res.status, body);
			}
		},

		// Route management — zone-scoped, standard JSON API.
		listRoutes: (zoneId: string): Promise<CfWorkerRoute[]> =>
			cfRequest<CfWorkerRoute[]>(rest, "GET", `/zones/${zoneId}/workers/routes`),

		createRoute: (zoneId: string, pattern: string, script: string): Promise<CfWorkerRoute> =>
			cfRequest<CfWorkerRoute>(rest, "POST", `/zones/${zoneId}/workers/routes`, { pattern, script }),

		updateRoute: (zoneId: string, routeId: string, pattern: string, script: string): Promise<CfWorkerRoute> =>
			cfRequest<CfWorkerRoute>(rest, "PUT", `/zones/${zoneId}/workers/routes/${routeId}`, { pattern, script }),
	};
}
