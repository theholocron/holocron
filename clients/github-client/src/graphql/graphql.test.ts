import { ProviderApiError } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { stubFetch, TOKEN } from "../test-helpers.js";
import { createGitHubGraphQLClient } from "./graphql.js";

describe("createGitHubGraphQLClient", () => {
	it("returns the data of an answer with no errors", async () => {
		const { fetch } = stubFetch([{ body: { data: { viewer: { login: "x" } } } }]);
		const client = createGitHubGraphQLClient({ token: TOKEN, fetch });
		expect(await client.query("query { viewer { login } }")).toEqual({ viewer: { login: "x" } });
	});

	it("throws one message per distinct error, with the distinct errors as a JSON string in details", async () => {
		const repeated = Array.from({ length: 50 }, () => ({ message: "Resource limits for this query exceeded." }));
		const { fetch } = stubFetch([
			{ body: { errors: [...repeated, { message: "Nope", type: "FORBIDDEN", path: ["node", "items"] }] } },
		]);
		const client = createGitHubGraphQLClient({ token: TOKEN, fetch });
		const err = await client.query("query { x }").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toBe(
			"GitHub GraphQL → Resource limits for this query exceeded.; Nope [FORBIDDEN, node.items]"
		);
		expect((err as ProviderApiError).status).toBe(200);
		expect(JSON.parse(String((err as ProviderApiError).details))).toEqual([
			{ message: "Resource limits for this query exceeded." },
			{ message: "Nope", type: "FORBIDDEN", path: ["node", "items"] },
		]);
	});
});
