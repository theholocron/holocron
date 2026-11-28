import type { RestClient } from "../utils.js";

/** The git hosting services Codecov knows an owner by. */
export type CodecovService =
	"bitbucket" | "bitbucket_server" | "github" | "github_enterprise" | "gitlab" | "gitlab_enterprise";

/** A repository as Codecov reports it. Only the fields Holocron reads are typed; Codecov sends more. */
export interface CodecovRepo {
	/** The repository name. */
	name: string;
	/** Whether the repository is private. */
	private?: boolean;
	/** The default branch. */
	branch?: string;
	/** Whether the repository has received a coverage upload. */
	active?: boolean;
	/** Whether the repository has not been manually deactivated. */
	activated?: boolean;
	/** The owner. */
	author?: {
		/** The service the owner is on. */
		service?: string;
		/** The owner's login. */
		username?: string;
		/** The owner's display name. */
		name?: string;
	};
}

/** The `repos` group of the Codecov client. */
export function repos(rest: RestClient) {
	return {
		/** Get one repository: `GET /{service}/{owner}/repos/{repo}/`. */
		get: (service: CodecovService, owner: string, repo: string): Promise<CodecovRepo> =>
			rest.request<CodecovRepo>(`/${service}/${encodeURIComponent(owner)}/repos/${encodeURIComponent(repo)}/`),
	};
}
