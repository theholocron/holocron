import { cfRequest, type RestClient } from "../utils.js";

/** A Cloudflare Tunnel. */
export interface CfTunnel {
	/** The tunnel's identifier. */
	id: string;
	/** The tunnel's name. */
	name: string;
}

/** One ingress rule of a tunnel's configuration. */
export interface CfIngressRule {
	/** The hostname the rule matches; omitted for the catch-all rule. */
	hostname?: string;
	/** The origin service requests are sent to. */
	service: string;
	/** The path the rule matches, when it is limited to one. */
	path?: string;
}

/** A tunnel's configuration. */
export interface CfTunnelConfig {
	/** The ingress rules, evaluated in order. */
	ingress: CfIngressRule[];
}

export function tunnels(rest: RestClient) {
	return {
		create: (accountId: string, input: { name: string }): Promise<CfTunnel> =>
			cfRequest<CfTunnel>(rest, "POST", `/accounts/${accountId}/cfd_tunnel`, {
				name: input.name,
				config_src: "cloudflare",
			}),

		list: (accountId: string): Promise<CfTunnel[]> =>
			cfRequest<CfTunnel[]>(rest, "GET", `/accounts/${accountId}/cfd_tunnel`, undefined, {
				is_deleted: "false",
			}),

		token: (accountId: string, tunnelId: string): Promise<string> =>
			cfRequest<string>(rest, "GET", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`),

		delete: (accountId: string, tunnelId: string): Promise<void> =>
			cfRequest<void>(rest, "DELETE", `/accounts/${accountId}/cfd_tunnel/${tunnelId}`, undefined, {
				cascade: "true",
			}),

		getConfig: (accountId: string, tunnelId: string): Promise<{ config: CfTunnelConfig }> =>
			cfRequest<{ config: CfTunnelConfig }>(
				rest,
				"GET",
				`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`
			),

		putConfig: (accountId: string, tunnelId: string, config: CfTunnelConfig): Promise<void> =>
			cfRequest<void>(rest, "PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, { config }),
	};
}
