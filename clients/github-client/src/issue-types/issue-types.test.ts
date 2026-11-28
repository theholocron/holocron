import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN } from "../test-helpers.js";

const TYPE = { id: 7, name: "Epic", description: "A body of work", color: "purple", is_enabled: true };

describe("issueTypes", () => {
	it("GET /orgs/{org}/issue-types", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: [TYPE] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.issueTypes.list("acme")).toEqual([TYPE]);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/orgs/acme/issue-types");
	});

	it("POST /orgs/{org}/issue-types with the given body", async () => {
		const { fetch, calls } = stubFetch([{ status: 201, body: TYPE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issueTypes.create("acme", { name: "Epic", is_enabled: true, color: "purple" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ name: "Epic", is_enabled: true, color: "purple" });
	});

	it("PUT /orgs/{org}/issue-types/{id}", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: TYPE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issueTypes.update("acme", 7, { name: "Epic", is_enabled: true, description: "New" });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/orgs/acme/issue-types/7");
	});

	it("has no way to delete a Type", () => {
		const client = createGitHubClient({ token: TOKEN, fetch: stubFetch([]).fetch });
		expect(Object.keys(client.issueTypes).sort()).toEqual(["create", "list", "update"]);
	});
});
