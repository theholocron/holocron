import type { WikiProxyConfig, Workers } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { CloudflareClientOptions } from "@theholocron/cloudflare-client";

interface CfRoute {
	id: string;
	pattern: string;
	script: string | null;
}

interface CfEnvelope<T> {
	success: boolean;
	errors: unknown[];
	result: T;
}

// Minimal slice of CloudflareClient needed for zone lookups.
interface ZonesClient {
	list(query?: { name?: string; per_page?: number }): Promise<Array<{ id: string }>>;
}

export class CloudflareWorkers implements Workers {
	readonly key = "workers" as const;
	readonly providerName = "cloudflare";

	private readonly zoneCache = new Map<string, string>();
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly token: string;

	constructor(
		private readonly zones: ZonesClient,
		private readonly accountId: string,
		opts: Pick<CloudflareClientOptions, "token" | "baseUrl" | "fetch">
	) {
		this.token = opts.token;
		this.baseUrl = opts.baseUrl ?? "https://api.cloudflare.com/client/v4";
		this.fetchImpl = opts.fetch ?? globalThis.fetch;
	}

	async upsertProxy(hostname: string, config: WikiProxyConfig): Promise<void> {
		const scriptName = hostnameToScriptName(hostname);
		const script = generateProxyScript(config);

		await this.putScript(scriptName, script);

		const zoneId = await this.resolveZone(hostname);
		const pattern = `${hostname}/*`;
		const routes = await this.listRoutes(zoneId);
		const existing = routes.find((r) => r.pattern === pattern);
		if (existing) {
			if (existing.script !== scriptName) {
				await this.updateRoute(zoneId, existing.id, pattern, scriptName);
			}
		} else {
			await this.createRoute(zoneId, pattern, scriptName);
		}
	}

	private async putScript(scriptName: string, script: string): Promise<void> {
		const form = new FormData();
		form.append(
			"metadata",
			new Blob([JSON.stringify({ main_module: "index.js", compatibility_date: "2025-08-31" })], {
				type: "application/json",
			})
		);
		form.append("index.js", new Blob([script], { type: "application/javascript+module" }), "index.js");

		const path = `/accounts/${this.accountId}/workers/scripts/${encodeURIComponent(scriptName)}`;
		const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
			method: "PUT",
			headers: { authorization: `Bearer ${this.token}` },
			body: form,
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(`Cloudflare PUT ${path} → ${res.status}`, res.status, body);
		}
	}

	private listRoutes(zoneId: string): Promise<CfRoute[]> {
		return this.cfRequest<CfRoute[]>("GET", `/zones/${zoneId}/workers/routes`);
	}

	private createRoute(zoneId: string, pattern: string, script: string): Promise<CfRoute> {
		return this.cfRequest<CfRoute>("POST", `/zones/${zoneId}/workers/routes`, { pattern, script });
	}

	private updateRoute(zoneId: string, routeId: string, pattern: string, script: string): Promise<CfRoute> {
		return this.cfRequest<CfRoute>("PUT", `/zones/${zoneId}/workers/routes/${routeId}`, { pattern, script });
	}

	private async cfRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
		const headers: Record<string, string> = {
			authorization: `Bearer ${this.token}`,
			accept: "application/json",
		};
		const init: RequestInit = { method, headers };
		if (body !== undefined) {
			headers["content-type"] = "application/json";
			init.body = JSON.stringify(body);
		}
		const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new ProviderApiError(`Cloudflare ${method} ${path} → ${res.status}`, res.status, text);
		}
		const envelope = (await res.json()) as CfEnvelope<T>;
		if (!envelope.success) {
			throw new ProviderApiError(
				`Cloudflare ${method} ${path} returned success:false`,
				0,
				JSON.stringify(envelope.errors)
			);
		}
		return envelope.result;
	}

	// Walk from full domain up to apex to find the Cloudflare zone.
	private async resolveZone(domain: string): Promise<string> {
		const cached = this.zoneCache.get(domain);
		if (cached) return cached;
		const parts = domain.split(".");
		for (let i = 0; i < parts.length - 1; i++) {
			const candidate = parts.slice(i).join(".");
			const zones = await this.zones.list({ name: candidate });
			if (zones.length > 0) {
				this.zoneCache.set(domain, zones[0]!.id);
				return zones[0]!.id;
			}
		}
		throw new ProviderApiError(`No Cloudflare zone found for domain: ${domain}`, 404, undefined);
	}
}

function hostnameToScriptName(hostname: string): string {
	return hostname.replace(/\./g, "-") + "-proxy";
}

function generateProxyScript(config: WikiProxyConfig): string {
	const targetJson = JSON.stringify(config.target);
	const headersJson = JSON.stringify(config.headers);
	return [
		`export default {`,
		`  async fetch(request) {`,
		`    const url = new URL(request.url);`,
		`    const target = new URL(url.pathname + url.search, ${targetJson});`,
		`    const headers = new Headers(request.headers);`,
		`    for (const [k, v] of Object.entries(${headersJson})) headers.set(k, v);`,
		`    return fetch(target, { method: request.method, headers, body: request.body, redirect: "follow" });`,
		`  },`,
		`};`,
	].join("\n");
}
