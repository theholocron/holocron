/**
 * Repo coordinate parsing — `"owner/name"` → `{ owner, name }`. Used
 * by every capability that hits the GitHub REST API to build URL paths.
 */

export interface RepoCoord {
	owner: string;
	name: string;
}

export class RepoError extends Error {
	override name = "RepoError";
}

export function parseRepo(repo: string): RepoCoord {
	if (!repo) {
		throw new RepoError('repo is required; pass { repo: "owner/name" } in plugin options');
	}
	const [owner, name] = repo.split("/");
	if (!owner || !name) {
		throw new RepoError(`invalid repo "${repo}" — expected "owner/name"`);
	}
	return { owner, name };
}
