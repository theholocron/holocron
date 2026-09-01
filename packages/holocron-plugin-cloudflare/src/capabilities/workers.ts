import type { WikiProxyConfig, Workers } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { CloudflareClient } from "../rest.js";

export class CloudflareWorkers implements Workers {
	readonly key = "workers" as const;
	readonly providerName = "cloudflare";

	private readonly zoneCache = new Map<string, string>();

	constructor(
		private readonly client: CloudflareClient,
		private readonly accountId: string
	) {}

	async upsertProxy(hostname: string, config: WikiProxyConfig): Promise<void> {
		const scriptName = hostnameToScriptName(hostname);
		const script = generateProxyScript(config);

		await this.client.workers.putScript(this.accountId, scriptName, script);

		const zoneId = await this.resolveZone(hostname);
		const pattern = `${hostname}/*`;
		const routes = await this.client.workers.listRoutes(zoneId);
		const existing = routes.find((r) => r.pattern === pattern);
		if (existing) {
			if (existing.script !== scriptName) {
				await this.client.workers.updateRoute(zoneId, existing.id, pattern, scriptName);
			}
		} else {
			await this.client.workers.createRoute(zoneId, pattern, scriptName);
		}
	}

	// Same zone-walk logic as CloudflareDns — walk from full domain to apex.
	private async resolveZone(domain: string): Promise<string> {
		const cached = this.zoneCache.get(domain);
		if (cached) return cached;
		const parts = domain.split(".");
		for (let i = 0; i < parts.length - 1; i++) {
			const candidate = parts.slice(i).join(".");
			const zones = await this.client.zones.list({ name: candidate });
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
