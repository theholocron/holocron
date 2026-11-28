/**
 * `cache` capability for Turbo: Turborepo's remote cache, which Vercel serves.
 *
 * The one method asks Vercel's artifacts status endpoint (`GET /v8/artifacts/status`) for the configured team and
 * reads only what that answer says. Documented replies: 200 with `status` (`enabled`, `disabled`, `over_limit`,
 * `paused`) and, for a token that can read but not upload, `readOnly: true`; 401, 402, 403, 404 and 410 as errors.
 * What each error means for a token valid for another team is not documented; it is read as "the cache does not answer
 * for this team with this token", which is what the check is about.
 */

import type { Cache, CacheTokenCheck } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { TurboClient } from "../rest.js";

/** What is shown when no team is set: the variable to set, and what happens without it. */
export const NO_TEAM =
	"no team: set HOLOCRON_TURBO_TEAM (or TURBO_TEAM); without it Turborepo turns the remote cache off";

/** The `cache` capability for Turbo: checks that Vercel accepts the token and the remote cache answers for the team. */
export class TurboCache implements Cache {
	/** The capability key, always `cache`. */
	readonly key = "cache" as const;
	/** The provider name, `turbo`. */
	readonly providerName = "turbo";

	/** `client` and `team` are thunks: the token and the team are read when a method runs, not when the plugin loads. */
	constructor(
		private readonly client: () => TurboClient,
		private readonly team: () => string | undefined
	) {}

	async checkToken(): Promise<CacheTokenCheck> {
		const team = this.team();
		if (!team) return { ok: false, problem: "team", reason: NO_TEAM };
		try {
			const { status, readOnly } = await this.client().cache.status(team);
			const read = readOnly === true ? { readOnly: true } : {};
			if (status === "enabled") {
				return {
					ok: true,
					status,
					...read,
					...(readOnly === true ? { reason: "the token can read the cache but not upload to it" } : {}),
				};
			}
			return {
				ok: false,
				problem: "cache",
				status,
				...read,
				reason: `Remote Caching is ${status} for ${team}`,
			};
		} catch (err) {
			if (err instanceof ProviderApiError) {
				switch (err.status) {
					case 401:
						return { ok: false, problem: "token", reason: "Vercel refused the token (401)" };
					case 403:
						return { ok: false, problem: "team", reason: `the token has no access to ${team} (403)` };
					case 404:
						return { ok: false, problem: "team", reason: `${team} was not found (404)` };
					case 402:
						return {
							ok: false,
							problem: "cache",
							reason: `${team} needs a payment method for Remote Caching (402)`,
						};
					case 410:
						return {
							ok: false,
							problem: "cache",
							reason: `Remote Caching is no longer available for ${team} (410)`,
						};
				}
			}
			throw err;
		}
	}
}
