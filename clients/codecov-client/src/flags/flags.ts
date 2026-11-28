import type { CodecovService } from "../repos/repos.js";
import type { RestClient } from "../utils.js";

/** A flag as Codecov reports it for a repository. Only the fields Holocron reads are typed. */
export interface CodecovFlag {
	/** The flag's name, as an upload names it. */
	flag_name: string;
	/** The flag's coverage percentage, when it has one. */
	coverage?: number | null;
}

/** One page of `GET /{service}/{owner}/repos/{repo}/flags/`. */
interface FlagPage {
	/** The flags on this page. */
	results?: CodecovFlag[];
	/** The URL of the next page, or `null` on the last. */
	next?: string | null;
}

/** The most pages `flags.list` reads, so a service that never ends its list cannot loop it forever. */
const MAX_PAGES = 50;

/** The `flags` group of the Codecov client. */
export function flags(rest: RestClient) {
	return {
		/**
		 * List every flag of a repository: `GET /{service}/{owner}/repos/{repo}/flags/?page=<n>&page_size=100`, following
		 * the pages until `next` is null.
		 */
		list: async (service: CodecovService, owner: string, repo: string): Promise<CodecovFlag[]> => {
			const base = `/${service}/${encodeURIComponent(owner)}/repos/${encodeURIComponent(repo)}/flags/`;
			const found: CodecovFlag[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const body = await rest.request<FlagPage>(`${base}?page=${page}&page_size=100`);
				found.push(...(body.results ?? []));
				if (!body.next) break;
			}
			return found;
		},
	};
}
