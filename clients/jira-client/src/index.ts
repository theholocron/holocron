import { createRestClient } from "@theholocron/http-client";

import { issues } from "./issues.js";
import { links } from "./links.js";
import { projects } from "./projects.js";
import { transitions } from "./transitions.js";
import { versions } from "./versions.js";

export type * from "./types.js";
export type { IssueLinkResult } from "./links.js";

export type { issues, links, projects, transitions, versions };

export function createJiraClient(options: {
	host: string;
	token: string;
	fetch?: typeof fetch;
}) {
	// Jira REST API v2 uses HTTP Basic auth. We pass the pre-encoded token
	// (Base64 "email:apiToken") via the apikey scheme targeting the standard
	// Authorization header, prefixing it with the required "Basic " scheme.
	const client = createRestClient({
		baseUrl: options.host,
		token: `Basic ${options.token}`,
		tokenScheme: "apikey",
		apiKeyHeader: "authorization",
		vendor: "Jira",
		fetch: options.fetch,
	});
	return {
		issues: issues(client),
		links: links(client),
		projects: projects(client),
		transitions: transitions(client),
		versions: versions(client),
	};
}
