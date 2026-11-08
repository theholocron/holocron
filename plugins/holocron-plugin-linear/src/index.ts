/**
 * `@theholocron/holocron-plugin-linear` — entrypoint.
 *
 * Implements `issues` and `projects` against Linear's GraphQL API, and `export`/`import` on `issues` so
 * `holocron migrate` can move issues between Linear and another tracker.
 */

import type { Issues, Projects, ProviderAction } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { LinearIssues } from "./capabilities/issues.js";
import { LinearProjects } from "./capabilities/projects.js";
import { createTeamScope, type TeamScope } from "./capabilities/team-scope.js";
import { linearDoctor } from "./provider/doctor.js";
import { declaresAnything, parseLinearSetup } from "./provider/provider-config.js";
import { row } from "./provider/rows.js";
import { linearSetup } from "./provider/setup.js";
import { createLinearClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Linear plugin. */
export interface LinearPluginOptions extends ResolveTokenInput {
	/** The key of the team the issues and boards belong to, e.g. `ENG`. Required by both capabilities. */
	team?: string;
	/** Names of the states the `inProgress` and `inReview` lifecycle slots move an issue to. */
	states?: {
		/** The state for work that has started. */
		inProgress?: string;
		/** The state for work waiting on review. */
		inReview?: string;
	};
	/** The team's automation, set by `provider linear setup` and compared by `provider linear doctor`. */
	automation?: {
		/** Close an issue after `months` without activity (0 is off), into the state named `state` (the team's default if left out). */
		autoClose?: {
			/** Months of inactivity; 0 switches auto-close off. */
			months: number;
			/** The name of the team state an auto-closed issue is put in. */
			state?: string;
		};
		/** Archive a closed issue after `months` (0 is off). */
		autoArchive?: {
			/** Months after closing; 0 switches auto-archive off. */
			months: number;
		};
		/**
		 * Git automation rules `provider linear setup` makes (or repoints) and `provider linear doctor` compares. `event` is
		 * one of `draft`, `review`, `start`, `mergeable`, `merge`; `state` is a team state name; `branch` limits the rule to
		 * pull requests targeting that exact branch name.
		 */
		git?: Array<{ event: string; state: string; branch?: string }>;
	};
	/** Issue templates (`name`, and the `.holocron/linear/*.md` file). Validated and reported as skipped: not applied or compared. */
	templates?: Array<{ name: string; file: string }>;
	/** Labels `provider linear setup` makes on the team when they are missing. */
	labels?: string[];
	/** A project `provider linear setup` makes when it is missing. */
	project?: string;
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

/**
 * Reads the block under the issues entry, then runs a step against it. A block that declares nothing is one `skip` row,
 * not a silent success; a wrong shape is a `ConfigError` naming the path.
 */
function providerAction(
	options: LinearPluginOptions,
	make: (scope: TeamScope, config: ReturnType<typeof parseLinearSetup>) => ProviderAction
): ProviderAction {
	return async (ctx) => {
		const config = parseLinearSetup(options);
		if (!declaresAnything(config)) {
			return [
				row(
					"linear",
					"linear",
					"skip",
					"nothing to do: declare `labels`, `project`, `templates` or `automation` under the issues provider's options"
				),
			];
		}
		return make(createScope(options), config)(ctx);
	};
}

/** Creates the plugin: a `connection` probe, `setup` and `doctor`, and the `issues` and `projects` capabilities. */
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
		setup: providerAction(options, linearSetup),
		doctor: providerAction(options, linearDoctor),
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
