import type { GitHubClient, OrgProperty } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { propertyFixHints } from "./property-fix-hints.js";
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
 * The values `values` holds that the organization's property definitions do not allow, one sentence each, or
 * `undefined` when the definitions cannot be read (the token lacks the organization's custom properties permission, or
 * the organization defines none). `client` should be the organization-scoped one when there is one, since reading the
 * definitions is an organization permission a repository token often lacks. Read-only.
 */
export async function checkPropertyValues(
	client: GitHubClient,
	repo: string,
	values: Record<string, string | string[]>
): Promise<string[] | undefined> {
	const schema = await orgSchema(client, repo);
	return schema ? rejectedProperties(values, schema) : undefined;
}

/**
 * Sets the repo's custom properties. When GitHub answers 422 the error says which value it refused and what to do
 * about it: the values are compared with the organization's property definitions (read-only, with `schemaClient`, the
 * organization-scoped client when there is one), GitHub's own message is added, and each value GitHub says a property
 * does not allow gets the fix, which does not need the definitions to be readable. One refused value fails the whole
 * request, so none of the properties is set.
 */
export async function syncProperties(
	client: GitHubClient,
	repo: string,
	values: Record<string, string | string[]>,
	schemaClient: GitHubClient = client
): Promise<string> {
	try {
		await client.properties.setProperties(repo, values);
	} catch (err) {
		if (!(err instanceof ProviderApiError) || err.status !== 422) throw err;
		const problems = (await checkPropertyValues(schemaClient, repo, values)) ?? [];
		const said = githubMessage(err.details);
		const fixes = propertyFixHints(said);
		throw new Error(
			`GitHub refused the custom properties (422), so none was set: ${problems.length > 0 ? problems.join("; ") : "no value differs from the organization's definitions, or they could not be read"}. GitHub said: ${said}${fixes.length > 0 ? `. To fix it: ${fixes.join("; ")}` : ""}`,
			{ cause: err }
		);
	}
	return `${Object.keys(values).length} properties set`;
}

/** The values the organization's property `name` allows; `undefined` when it cannot be read, is not defined or takes any value. */
export async function getOrgPropertyValues(
	client: GitHubClient,
	repo: string,
	name: string
): Promise<string[] | undefined> {
	const found = (await orgSchema(client, repo))?.find((p) => p.property_name === name);
	return found?.allowed_values ?? undefined;
}

/**
 * Adds the missing `values` to the organization's property `name` and returns them. GitHub replaces the whole
 * definition on a write, so the current one is read and sent back with the allowed values extended, in their order,
 * and nothing removed. A write is made only when something is missing.
 */
export async function addOrgPropertyValues(
	client: GitHubClient,
	repo: string,
	name: string,
	values: string[]
): Promise<string[]> {
	const org = repo.split("/")[0] as string;
	const current = (await client.properties.orgSchema(org)).find((p) => p.property_name === name);
	if (!current) throw new Error(`the organization ${org} has no custom property "${name}"; create it first`);
	if (!current.allowed_values)
		throw new Error(`the custom property "${name}" takes any value; it has nothing to extend`);
	const have = new Set(current.allowed_values);
	const added = [...new Set(values)].filter((v) => !have.has(v));
	if (added.length === 0) return [];
	await client.properties.setOrgProperty(org, { ...current, allowed_values: [...current.allowed_values, ...added] });
	return added;
}
