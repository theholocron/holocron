import type { ErrorSink, Logger } from "@theholocron/observability/core";

import { createLinearGraphQL, type LinearGraphQL } from "./graphql/graphql.js";
import { issues } from "./issues/issues.js";
import { projects } from "./projects/projects.js";
import { teams } from "./teams/teams.js";

export {
	type Connection,
	createLinearGraphQL,
	type LinearGraphQL,
	type LinearGraphQLConfig,
	paginate,
} from "./graphql/graphql.js";
export { ISSUE_FIELDS } from "./issues/issues.js";
export type * from "./types.js";

/** Options of {@link createLinearClient}. */
export interface LinearClientOptions {
	/** A personal API key (`lin_api_...`) or an OAuth access token (`lin_oauth_...`). */
	token: string;
	/** Overrides the API root, for tests. Defaults to `https://api.linear.app`. */
	baseUrl?: string;
	/** Overrides `fetch`, for tests. */
	fetch?: typeof fetch;
	/** Structured logger for request diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

/** Creates a Linear client with `teams`, `issues` and `projects` groups and the raw `graphql` handle. */
export function createLinearClient(opts: LinearClientOptions) {
	const graphql: LinearGraphQL = createLinearGraphQL(opts);
	return { graphql, teams: teams(graphql), issues: issues(graphql), projects: projects(graphql) };
}

/** The client {@link createLinearClient} returns. */
export type LinearClient = ReturnType<typeof createLinearClient>;
