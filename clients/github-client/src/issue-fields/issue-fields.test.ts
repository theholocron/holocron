import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

describe("issueFields", () => {
	it("GET /orgs/{org}/issue-fields", async () => {
		const field = { id: 1, name: "Priority", data_type: "single_select", options: [{ id: 2, name: "Urgent" }] };
		const { fetch, calls } = stubFetch([{ body: [field] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.issueFields.list("theholocron")).resolves.toEqual([field]);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/orgs/theholocron/issue-fields");
	});

	it("GET /repos/{owner}/{name}/issues/{n}/issue-field-values", async () => {
		const value = {
			issue_field_id: 1,
			data_type: "single_select",
			value: "Urgent",
			single_select_option: { id: 2, name: "Urgent", color: "pink" },
		};
		const { fetch, calls } = stubFetch([{ body: [value] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.issueFields.values(REPO, 7)).resolves.toEqual([value]);
		expect(calls[0]?.url).toContain("/issues/7/issue-field-values");
	});

	it("POST adds values with the field id and the option name, never replacing", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issueFields.addValues(REPO, 7, [{ field_id: 1, value: "Urgent" }]);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues/7/issue-field-values");
		expect(calls[0]?.body).toEqual({ issue_field_values: [{ field_id: 1, value: "Urgent" }] });
	});

	it("DELETE removes one field's value", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issueFields.deleteValue(REPO, 7, 1);
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/issues/7/issue-field-values/1");
	});
});
