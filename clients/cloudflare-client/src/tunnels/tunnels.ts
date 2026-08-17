import { cfRequest, type RestClient } from "../utils.js";

export interface CfTunnel {
	id: string;
	name: string;
}

export interface CfIngressRule {
	hostname?: string;
	service: string;
	path?: string;
}

export interface CfTunnelConfig {
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
