import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export function topics(rest: RestClient) {
	return {
		setTopics: (repo: string, names: string[]): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/topics`, {
				method: "PUT",
				body: { names },
			}),
	};
}
