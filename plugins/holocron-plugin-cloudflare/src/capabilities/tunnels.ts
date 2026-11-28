import type { EnsuredTunnel, TunnelRoute, Tunnels } from "@theholocron/cli";
import type { CfIngressRule, CloudflareClient } from "@theholocron/cloudflare-client";

/** The rule a tunnel needs last: anything no other rule matches is answered with a 404 by the connector itself. */
const CATCH_ALL: CfIngressRule = { service: "http_status:404" };

/**
 * The ingress rules with `hostname` served at `service`: the rule for the hostname is replaced where it is or added
 * after the others, every other hostname's rule is kept, and the rule without a hostname closes the list.
 */
function withRoute(current: CfIngressRule[], hostname: string, service: string): CfIngressRule[] {
	const rule: CfIngressRule = { hostname, service };
	const named = current.filter((r) => r.hostname !== undefined);
	const at = named.findIndex((r) => r.hostname === hostname);
	const rules = at === -1 ? [...named, rule] : named.map((r, i) => (i === at ? rule : r));
	return [...rules, current.find((r) => r.hostname === undefined) ?? CATCH_ALL];
}

/** The Cloudflare implementation of the `tunnels` capability, backed by Cloudflare Tunnel in one account. */
export class CloudflareTunnels implements Tunnels {
	/** The capability this class provides, always `"tunnels"`. */
	readonly key = "tunnels" as const;
	/** The provider name, `"cloudflare"`. */
	readonly providerName = "cloudflare";

	constructor(
		private readonly client: () => Pick<CloudflareClient, "tunnels">,
		private readonly accountId: string
	) {}

	/** Finds the tunnel by name or makes it, then rewrites its routes only when they do not already serve the hostname. */
	async ensureTunnel(route: TunnelRoute): Promise<EnsuredTunnel> {
		const { tunnels } = this.client();
		const found = (await tunnels.list(this.accountId)).find((t) => t.name === route.name);
		const tunnel = found ?? (await tunnels.create(this.accountId, { name: route.name }));
		const current = (await tunnels.getConfig(this.accountId, tunnel.id)).config?.ingress ?? [];
		const wanted = withRoute(current, route.hostname, route.service);
		const configured = JSON.stringify(wanted) !== JSON.stringify(current);
		if (configured) await tunnels.putConfig(this.accountId, tunnel.id, { ingress: wanted });
		return {
			id: tunnel.id,
			name: tunnel.name,
			created: found === undefined,
			configured,
			target: `${tunnel.id}.cfargotunnel.com`,
		};
	}

	/** The token `cloudflared` runs the tunnel with. */
	tunnelToken(tunnelId: string): Promise<string> {
		return this.client().tunnels.token(this.accountId, tunnelId);
	}

	/** `holocron doctor` has no specific tunnel to check: lists the ones the token can see. */
	async whoami(): Promise<{ ok: boolean; tunnels: number }> {
		const all = await this.client().tunnels.list(this.accountId);
		return { ok: true, tunnels: all.length };
	}
}
