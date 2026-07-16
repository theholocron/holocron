import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export function branches(rest: RestClient) {
	return {
		protectBranch: (
			repo: string,
			branch: string,
			payload: Record<string, unknown>,
		): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/branches/${encodeURIComponent(branch)}/protection`,
				{ method: "PUT", body: payload },
			),
	};
}
