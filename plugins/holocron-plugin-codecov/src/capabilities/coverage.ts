/**
 * `coverage` capability for Codecov.
 *
 * Only `checkToken()` is built. Codecov has two kinds of token: the repository upload token (what `measure:bundle` sends
 * as `HOLOCRON_CODECOV_TOKEN`), which Codecov's REST API v2 does not document as accepted, and an API token (a personal
 * access token), which it takes as a bearer token. `GET /{service}/{owner}/repos/{repo}/` is the one read that fits
 * both questions, so the method reports what that read answered and never turns a 401 into a verdict on the token: an
 * upload token, a revoked one and one with no access all look alike.
 */

import type { Coverage, CoverageTokenCheck } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { CodecovClient } from "../rest.js";
import { type CodecovTarget, describeTarget } from "../target.js";

/** The `coverage` capability for Codecov. */
export class CodecovCoverage implements Coverage {
	/** The capability key, always `coverage`. */
	readonly key = "coverage" as const;
	/** The provider name, `codecov`. */
	readonly providerName = "codecov";

	/**
	 * `client` is a thunk, so the token is resolved on first use and a plugin load never needs one. `target` is `undefined`
	 * when the options name no repository.
	 */
	constructor(
		private readonly client: () => CodecovClient,
		private readonly target: CodecovTarget | undefined
	) {}

	async checkToken(): Promise<CoverageTokenCheck> {
		if (!this.target) {
			throw new Error(
				"@theholocron/holocron-plugin-codecov needs a repository (the plugin options owner and repo, or the active repo) for checkToken"
			);
		}
		const { service, owner, repo } = this.target;
		try {
			const found = await this.client().repos.get(service, owner, repo);
			return { outcome: "accepted", ...(found.private === undefined ? {} : { repoPrivate: found.private }) };
		} catch (err) {
			if (err instanceof ProviderApiError) {
				if (err.status === 401 || err.status === 403) return { outcome: "refused", status: err.status };
				if (err.status === 404) return { outcome: "not-found", status: 404 };
			}
			throw new Error(`Codecov could not be asked about ${describeTarget(this.target)}: ${String(err)}`, {
				cause: err,
			});
		}
	}
}
