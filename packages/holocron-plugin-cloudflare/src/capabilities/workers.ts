import type { DeployScriptConfig, DeployScriptResult, WikiProxyConfig, Workers } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { CloudflareClient } from "@theholocron/cloudflare-client";

export class CloudflareWorkers implements Workers {
	readonly key = "workers" as const;
	readonly providerName = "cloudflare";

	private readonly zoneCache = new Map<string, string>();

	constructor(
		private readonly client: () => Pick<CloudflareClient, "workers" | "zones">,
		private readonly accountId: string
	) {}

	async upsertProxy(hostname: string, config: WikiProxyConfig): Promise<void> {
		const scriptName = hostnameToScriptName(hostname);
		const script = generateProxyScript(config);
		await this.client().workers.putScript(this.accountId, scriptName, script);
		await this.upsertRoute(`${hostname}/*`, scriptName);
	}

	async deployScript(name: string, config: DeployScriptConfig): Promise<DeployScriptResult> {
		await this.client().workers.putScript(this.accountId, name, config.code);

		for (const [secretName, value] of Object.entries(config.secrets ?? {})) {
			await this.client().workers.putSecret(this.accountId, name, secretName, value);
		}

		for (const pattern of config.routes ?? []) {
			await this.upsertRoute(pattern, name);
		}

		return { scriptName: name };
	}

	/** Idempotent create-or-update for one route pattern — shared by both public methods. */
	private async upsertRoute(pattern: string, scriptName: string): Promise<void> {
		const hostname = pattern.split("/")[0]!;
		const zoneId = await this.resolveZone(hostname);
		const routes = await this.client().workers.listRoutes(zoneId);
		const existing = routes.find((r) => r.pattern === pattern);
		if (existing) {
			if (existing.script !== scriptName) {
				await this.client().workers.updateRoute(zoneId, existing.id, pattern, scriptName);
			}
		} else {
			await this.client().workers.createRoute(zoneId, pattern, scriptName);
		}
	}

	// Walk from full domain up to apex to find the Cloudflare zone.
	private async resolveZone(domain: string): Promise<string> {
		const cached = this.zoneCache.get(domain);
		if (cached) return cached;
		const parts = domain.split(".");
		for (let i = 0; i < parts.length - 1; i++) {
			const candidate = parts.slice(i).join(".");
			const zones = await this.client().zones.list({ name: candidate });
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
