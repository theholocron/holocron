import { auth } from "./auth/auth.js";
import { projects } from "./projects/projects.js";
import { createSentryRestClient, type SentryClientOptions } from "./utils.js";

export type { SentryOrganization } from "./auth/auth.js";
export type { CreateSentryProjectInput, SentryKey, SentryKeyDsn, SentryProject } from "./projects/projects.js";
export type { SentryClientOptions } from "./utils.js";

export function createSentryClient(opts: SentryClientOptions) {
	const rest = createSentryRestClient(opts);
	return {
		auth: auth(rest),
		projects: projects(rest),
	};
}

export type SentryClient = ReturnType<typeof createSentryClient>;
