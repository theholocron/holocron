/**
 * `@theholocron/holocron-plugin-linear` — entrypoint.
 *
 * Implements `issues` and `projects` against Linear's GraphQL API, and `export`/`import` on `issues` so
 * `holocron migrate` can move issues between Linear and another tracker.
 */

import type { Issues, Projects } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { LinearIssues } from "./capabilities/issues.js";
import { LinearProjects } from "./capabilities/projects.js";
import { createTeamScope, type TeamScope } from "./capabilities/team-scope.js";
import { createLinearClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Linear plugin. */
export interface LinearPluginOptions extends ResolveTokenInput {
	/** The key of the team the issues and boards belong to, e.g. `ENG`. Required by both capabilities. */
	team?: string;
	/** Names of the states the `inProgress` and `inReview` lifecycle slots move an issue to. */
	states?: { inProgress?: string; inReview?: string };
	/** Override the API root, for tests. Defaults to `https://api.linear.app`. */
	baseUrl?: string;
	/** Override `fetch`, for tests. */
	fetch?: typeof fetch;
}

/** The client and team the capabilities share; the token is resolved when a capability is first built. */
function createScope(options: LinearPluginOptions): TeamScope {
	if (!options.team) {
		throw new Error("the Linear plugin needs a `team` option (the team key, e.g. `ENG`)");
	}
	const client = createLinearClient({ token: resolveToken(options), baseUrl: options.baseUrl, fetch: options.fetch });
	return createTeamScope(client, options.team);
}

/** Builds the `issues` capability. */
export function issues(options: LinearPluginOptions): Issues {
	return new LinearIssues(createScope(options), options.states ? { states: options.states } : {});
}

/** Builds the `projects` capability. */
export function projects(options: LinearPluginOptions): Projects {
	return new LinearProjects(createScope(options));
}

/** Creates the plugin: a `connection` probe and the `issues` and `projects` capabilities. */
export function createPlugin(options: LinearPluginOptions) {
	return {
		name: "@theholocron/holocron-plugin-linear",
		probes: {
			connection: connectionProbe({
				provider: "Linear",
				url: options.baseUrl ?? "https://api.linear.app",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			issues: () => issues(options),
			projects: () => projects(options),
		},
	};
}

/** One-line hint shown by `holocron auth set linear` when no token is given or the token is rejected. */
export const AUTH_HINT =
	"create a personal API key at https://linear.app/settings/account/security (API keys), " +
	"then run: holocron auth set linear <KEY>";

export * from "./auth.js";
export { LinearIssues } from "./capabilities/issues.js";
export { AUTO_ARCHIVE_RULE, AUTO_CLOSE_RULE, LinearProjects } from "./capabilities/projects.js";
export { createLinearClient, type LinearClient, type LinearClientOptions } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
