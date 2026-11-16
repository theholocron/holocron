import type { RestClient } from "../utils.js";

/** The states Vercel documents for Remote Caching: usable (`enabled`) or not, and why. */
export type TurboCacheState = "enabled" | "disabled" | "over_limit" | "paused";

/** The response of `cache.status()`. `status` is typed loosely because the API may add states. */
export interface TurboCacheStatus {
	/** Whether Remote Caching is on for the team: one of {@link TurboCacheState}, or a state added later. */
	status: TurboCacheState | (string & {});
	/** Present and `true` when the token can read artifacts but cannot upload them. */
	readOnly?: boolean;
}

/**
 * How a team is named: Turborepo's `TURBO_TEAM` is a team slug (`acme`); a Vercel team id (`team_...`) is also
 * accepted and sent as `teamId`.
 */
export function teamQuery(team: string): Record<string, string> {
	return team.startsWith("team_") ? { teamId: team } : { slug: team };
}

export function cache(rest: RestClient) {
	return {
		/** `GET /v8/artifacts/status` for the team: whether Remote Caching is enabled, and whether the token is read-only. */
		status: (team: string): Promise<TurboCacheStatus> =>
			rest.request<TurboCacheStatus>("/v8/artifacts/status", { query: teamQuery(team) }),
	};
}
