import { dns } from "./dns/dns.js";
import { pages } from "./pages/pages.js";
import { tokens } from "./tokens/tokens.js";
import { tunnels } from "./tunnels/tunnels.js";
import { type CloudflareClientOptions, createCloudflareRestClient } from "./utils.js";
import { workers } from "./workers/workers.js";
import { zones } from "./zones/zones.js";

export type { CfDnsRecord, CfDnsRecordInput, CfDnsRecordType } from "./dns/dns.js";
export type {
	CfPagesDeployment,
	CfPagesDeploymentStage,
	CfPagesDomain,
	CfPagesEnvConfig,
	CfPagesEnvVar,
	CfPagesEnvVarType,
	CfPagesProject,
	CfPagesProjectInput,
} from "./pages/pages.js";
export type { CfTokenVerification } from "./tokens/tokens.js";
export type { CfIngressRule, CfTunnel, CfTunnelConfig } from "./tunnels/tunnels.js";
export type { CfEnvelope, CloudflareClientOptions } from "./utils.js";
export type { CfWorkerRoute } from "./workers/workers.js";
export type { CfZone } from "./zones/zones.js";

export function createCloudflareClient(opts: CloudflareClientOptions) {
	const rest = createCloudflareRestClient(opts);
	return {
		dns: dns(rest),
		pages: pages(rest),
		zones: zones(rest),
		tunnels: tunnels(rest),
		tokens: tokens(rest),
		workers: workers(rest, opts),
	};
}

export type CloudflareClient = ReturnType<typeof createCloudflareClient>;
