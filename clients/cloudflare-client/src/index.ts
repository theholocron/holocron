import { dns } from "./dns/dns.js";
import { tokens } from "./tokens/tokens.js";
import { tunnels } from "./tunnels/tunnels.js";
import { type CloudflareClientOptions, createCloudflareRestClient } from "./utils.js";
import { zones } from "./zones/zones.js";

export type { CfDnsRecord, CfDnsRecordInput, CfDnsRecordType } from "./dns/dns.js";
export type { CfTokenVerification } from "./tokens/tokens.js";
export type { CfIngressRule, CfTunnel, CfTunnelConfig } from "./tunnels/tunnels.js";
export type { CfEnvelope, CloudflareClientOptions } from "./utils.js";
export type { CfZone } from "./zones/zones.js";

export function createCloudflareClient(opts: CloudflareClientOptions) {
	const rest = createCloudflareRestClient(opts);
	return {
		dns: dns(rest),
		zones: zones(rest),
		tunnels: tunnels(rest),
		tokens: tokens(rest),
	};
}

export type CloudflareClient = ReturnType<typeof createCloudflareClient>;
