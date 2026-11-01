import type {
	DeployScriptConfig,
	DeployScriptResult,
	WikiProxyConfig,
	Workers,
	WorkerScriptState,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { CloudflareClient } from "@theholocron/cloudflare-client";

/** The Cloudflare implementation of the `workers` capability, backed by Workers scripts and routes in one account. */
export class CloudflareWorkers implements Workers {
	/** The capability this class provides, always `"workers"`. */
	readonly key = "workers" as const;
	/** The provider name, `"cloudflare"`. */
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

	/** `holocron doctor` has no specific script to check — lists every script the token can see instead. */
	async whoami(): Promise<{ ok: boolean; scripts: number }> {
		const scripts = await this.client().workers.listScripts(this.accountId);
		return { ok: true, scripts: scripts.length };
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

	async setSecret(script: string, name: string, value: string): Promise<void> {
		await this.client().workers.putSecret(this.accountId, script, name, value);
	}

	async secretNames(script: string): Promise<string[]> {
		return (await this.client().workers.listSecrets(this.accountId, script)).map((secret) => secret.name);
	}

	/**
	 * Whether the script exists, which routes in the zone of `host` point at it, and the names of its secrets. Reads
	 * only, and asks Cloudflare for names, so no value is ever fetched.
	 */
	async inspectScript(name: string, host: string): Promise<WorkerScriptState> {
		const client = this.client();
		const scripts = await client.workers.listScripts(this.accountId);
		if (!scripts.some((s) => s.id === name)) return { exists: false, routes: [], bindingNames: [] };
		const zoneId = await this.resolveZone(host);
		const routes = await client.workers.listRoutes(zoneId);
		const secrets = await client.workers.listSecrets(this.accountId, name);
		return {
			exists: true,
			routes: routes.filter((r) => r.script === name).map((r) => r.pattern),
			bindingNames: secrets.map((secret) => secret.name),
		};
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
