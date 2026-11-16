import type { CodecovService } from "../repos/repos.js";
import type { RestClient } from "../utils.js";

/** A component as Codecov reports it for a repository. Only the fields Holocron reads are typed. */
export interface CodecovComponent {
	/** The component's id, the `component_id` of `codecov.yml`. */
	component_id: string;
	/** The component's name. */
	name: string;
	/** The component's coverage percentage, when it has one. */
	coverage?: number | null;
}

/** The `components` group of the Codecov client. */
export function components(rest: RestClient) {
	return {
		/**
		 * List the components of a repository (of the default branch's head commit): `GET
		 * /{service}/{owner}/repos/{repo}/components/`. Codecov documents a plain array here; a paginated `{ results }`
		 * body is read the same way.
		 */
		list: async (service: CodecovService, owner: string, repo: string): Promise<CodecovComponent[]> => {
			const body = await rest.request<CodecovComponent[] | { results?: CodecovComponent[] }>(
				`/${service}/${encodeURIComponent(owner)}/repos/${encodeURIComponent(repo)}/components/`
			);
			return Array.isArray(body) ? body : (body.results ?? []);
		},
	};
}
