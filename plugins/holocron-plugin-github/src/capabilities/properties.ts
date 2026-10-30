import type { GitHubClient, OrgProperty } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { rejectedProperties } from "./rejected-properties.js";

/** GitHub's own message from a 422 body (`{"message": ..., "errors": [...]}`), or the start of the body when it is not JSON. */
function githubMessage(details: unknown): string {
	const raw = String(details ?? "").trim();
	try {
		const body = JSON.parse(raw) as { message?: unknown; errors?: unknown };
		const errors = Array.isArray(body.errors) ? body.errors.map((e) => JSON.stringify(e)).join(", ") : "";
		const message = typeof body.message === "string" ? body.message : raw;
		return errors ? `${message}: ${errors}` : message;
	} catch {
		return raw.slice(0, 300);
	}
}

/** The organization's property definitions, or `undefined` when they cannot be read (permission, an older client). */
async function orgSchema(client: GitHubClient, repo: string): Promise<OrgProperty[] | undefined> {
	try {
		return await client.properties.orgSchema(repo.split("/")[0] as string);
	} catch {
		return undefined;
	}
}

/**
 * Sets the repo's custom properties. When GitHub answers 422 the error says which value it refused: the values
 * are compared with the organization's property definitions (read-only), and GitHub's own message is added.
 * One refused value fails the whole request, so none of the properties is set.
 */
export async function syncProperties(
	client: GitHubClient,
	repo: string,
	values: Record<string, string | string[]>
): Promise<string> {
	try {
		await client.properties.setProperties(repo, values);
	} catch (err) {
		if (!(err instanceof ProviderApiError) || err.status !== 422) throw err;
		const schema = await orgSchema(client, repo);
		const problems = schema ? rejectedProperties(values, schema) : [];
		const said = githubMessage(err.details);
		throw new Error(
			`GitHub refused the custom properties (422), so none was set: ${problems.length > 0 ? problems.join("; ") : "no value differs from the organization's definitions, or they could not be read"}. GitHub said: ${said}`,
			{ cause: err }
		);
	}
	return `${Object.keys(values).length} properties set`;
}
