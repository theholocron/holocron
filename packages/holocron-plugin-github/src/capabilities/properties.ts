import { parseRepo } from "../repo.js";
import type { RestClient } from "@theholocron/cli";

/**
 * Sync custom property values for a repo to the org-defined schema.
 *
 * Calls `PATCH /repos/{owner}/{name}/properties/values` with the full
 * map — GitHub replaces only the supplied keys, leaving others untouched.
 */
export async function syncProperties(rest: RestClient, repo: string, values: Record<string, string>): Promise<string> {
	const { owner, name } = parseRepo(repo);

	const properties = Object.entries(values).map(([property_name, value]) => ({ property_name, value }));

	await rest.request<void>(`/repos/${owner}/${name}/properties/values`, {
		method: "PATCH",
		body: { properties },
	});

	return `${properties.length} properties set`;
}
