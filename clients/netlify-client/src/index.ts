import { deploys } from "./deploys/deploys.js";
import { env } from "./env/env.js";
import { sites } from "./sites/sites.js";
import { user } from "./user/user.js";
import { createNetlifyRestClient, type NetlifyClientOptions } from "./utils.js";

export type {
	NetlifyCreateDeployInput,
	NetlifyDeploy,
	NetlifyDeployFunctionSpec,
	NetlifyRawTransport,
} from "./deploys/deploys.js";
export type { NetlifyEnvContext, NetlifyEnvVar, NetlifyEnvVarValue } from "./env/env.js";
export type { NetlifyCreateSiteInput, NetlifySite, NetlifyUpdateSiteInput } from "./sites/sites.js";
export type { NetlifyUser } from "./user/user.js";
export type { NetlifyClientOptions } from "./utils.js";
export { buildZip } from "./zip.js";

export function createNetlifyClient(opts: NetlifyClientOptions) {
	const rest = createNetlifyRestClient(opts);
	return {
		sites: sites(rest),
		deploys: deploys(rest, { token: opts.token, baseUrl: opts.baseUrl, fetch: opts.fetch }),
		env: env(rest),
		user: user(rest),
	};
}

export type NetlifyClient = ReturnType<typeof createNetlifyClient>;
