/**
 * `coverage` capability for Codecov.
 *
 * `upload()` runs the Codecov CLI (see `../upload/`). The rest is `checkToken()` and `checkRepo()`. Codecov has two kinds of token: the repository upload token (what `measure:bundle`
 * sends as `HOLOCRON_CODECOV_UPLOAD_TOKEN`), which Codecov's REST API v2 does not document as accepted, and an API token (a
 * personal access token), which it takes as a bearer token. `GET /{service}/{owner}/repos/{repo}/` is the one read that
 * fits both questions, so `checkToken()` reports what that read answered and never turns a 401 into a verdict on the
 * token: an upload token, a revoked one and one with no access all look alike. `checkRepo()` lists the repository's flags
 * and components, which needs the API token (`HOLOCRON_CODECOV_API_TOKEN`) and says so, without failing, when it is unset.
 */

import type {
	Coverage,
	CoverageExpectations,
	CoverageRepoReport,
	CoverageStatusContext,
	CoverageStatusInput,
	CoverageTokenCheck,
	CoverageUploadInput,
	CoverageUploadResult,
} from "@theholocron/cli";
import { AuthError, ProviderApiError } from "@theholocron/cli";

import type { CodecovClient } from "../rest.js";
import { type CodecovTarget, describeTarget } from "../target.js";
import { defaultUploadDeps } from "../upload/default-deps.js";
import type { UploadDeps } from "../upload/upload.type.js";
import { uploadCoverage } from "../upload/upload-coverage.js";
import { diffNames } from "./diff-names.js";
import { statusContexts } from "./status-contexts.js";

const NO_API_TOKEN =
	"set HOLOCRON_CODECOV_API_TOKEN to a Codecov personal API token to compare flags and components (the upload token HOLOCRON_CODECOV_UPLOAD_TOKEN is not accepted by Codecov's REST API)";

/** The `coverage` capability for Codecov. */
export class CodecovCoverage implements Coverage {
	/** The capability key, always `coverage`. */
	readonly key = "coverage" as const;
	/** The provider name, `codecov`. */
	readonly providerName = "codecov";

	/**
	 * `client` is a thunk, so the token is resolved on first use and a plugin load never needs one. `target` is `undefined`
	 * when the options name no repository. `apiClient` builds the client from the API token for `checkRepo()` and throws an
	 * `AuthError` when there is none; left out, `checkRepo()` reports that it has no token.
	 */
	constructor(
		private readonly client: () => CodecovClient,
		private readonly target: CodecovTarget | undefined,
		private readonly apiClient?: () => CodecovClient,
		private readonly uploadDeps: () => UploadDeps = defaultUploadDeps
	) {}

	async checkRepo(expected: CoverageExpectations): Promise<CoverageRepoReport> {
		if (!this.target) {
			throw new Error(
				"@theholocron/holocron-plugin-codecov needs a repository (the plugin options owner and repo, or the active repo) for checkRepo"
			);
		}
		const unchecked = (reason: string): CoverageRepoReport => ({
			checked: false,
			reason,
			flags: diffNames(expected.flags, expected.flags),
			components: diffNames(expected.components, expected.components),
		});
		let api: CodecovClient;
		try {
			if (!this.apiClient) return unchecked(NO_API_TOKEN);
			api = this.apiClient();
		} catch (err) {
			if (err instanceof AuthError) return unchecked(NO_API_TOKEN);
			throw err;
		}
		const { service, owner, repo } = this.target;
		try {
			const [flags, components] = await Promise.all([
				api.flags.list(service, owner, repo),
				api.components.list(service, owner, repo),
			]);
			return {
				checked: true,
				flags: diffNames(
					expected.flags,
					flags.map((flag) => flag.flag_name)
				),
				components: diffNames(
					expected.components,
					components.map((component) => component.component_id)
				),
			};
		} catch (err) {
			if (err instanceof ProviderApiError) {
				if (err.status === 401 || err.status === 403) {
					return unchecked(
						`Codecov answered ${err.status} for ${describeTarget(this.target)}: HOLOCRON_CODECOV_API_TOKEN must be a personal API token that can see the repository`
					);
				}
				if (err.status === 404) {
					return unchecked(
						`Codecov has no ${describeTarget(this.target)}, or the API token cannot see it (404)`
					);
				}
			}
			throw new Error(`Codecov could not be asked about ${describeTarget(this.target)}: ${String(err)}`, {
				cause: err,
			});
		}
	}

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

	/**
	 * Uploads the reports, one flag per group, authenticated with the job's OIDC token (no stored token, so the plugin
	 * needs none for this). The Codecov CLI does the upload; see `uploadCoverage()`.
	 */
	upload(input: CoverageUploadInput): Promise<CoverageUploadResult> {
		return uploadCoverage(input, this.uploadDeps());
	}

	/** The commit statuses Codecov posts, by name: see `statusContexts()`. Offline, so it needs no token and no repository. */
	statusContexts(input: CoverageStatusInput): CoverageStatusContext[] {
		return statusContexts(input);
	}
}
