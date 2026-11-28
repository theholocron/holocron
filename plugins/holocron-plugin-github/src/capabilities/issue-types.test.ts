import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubIssues } from "./issues.js";

const EPIC = { id: 7, name: "Epic", description: "A body of work", color: "purple", is_enabled: true };

function make(responses: Parameters<typeof stubFetch>[0], withOrg = true) {
	const org = stubFetch(responses);
	const issuesStub = stubFetch([]);
	const orgClient = createGitHubClient({ token: "org", fetch: org.fetch });
	return {
		issues: new GitHubIssues(createGitHubClient({ token: "pat", fetch: issuesStub.fetch }), {
			repo: "acme/repo",
			...(withOrg ? { orgClient: () => orgClient } : {}),
		}),
		org: org.calls,
		shared: issuesStub.calls,
	};
}

describe("GitHubIssues issue Types", () => {
	it("lists the organization's Types through the organization client, leaving the shared one unused", async () => {
		const { issues, org, shared } = make([
			{ status: 200, body: [EPIC, { id: 8, name: "Bug", is_enabled: false }] },
		]);
		expect(await issues.listTypes()).toEqual([
			{ id: 7, name: "Epic", description: "A body of work", color: "purple", enabled: true },
			{ id: 8, name: "Bug", enabled: false },
		]);
		expect(org[0]?.url).toContain("/orgs/acme/issue-types");
		expect(shared).toHaveLength(0);
	});

	it("reads undefined, and refuses to write, with no organization token", async () => {
		const { issues } = make([], false);
		expect(await issues.listTypes()).toBeUndefined();
		await expect(issues.createType({ name: "Epic" })).rejects.toThrow(/HOLOCRON_ORG_TOKEN/);
		await expect(issues.updateType(7, { color: "red" })).rejects.toThrow(/HOLOCRON_ORG_TOKEN/);
	});

	it("makes a Type enabled unless told otherwise", async () => {
		const { issues, org } = make([{ status: 201, body: EPIC }]);
		expect(await issues.createType({ name: "Epic", color: "purple" })).toMatchObject({ id: 7, name: "Epic" });
		expect(org[0]?.method).toBe("POST");
		expect(org[0]?.body).toEqual({ name: "Epic", is_enabled: true, color: "purple" });
	});

	it("updates the description and colour while sending the current name and enabled flag back", async () => {
		const { issues, org } = make([
			{ status: 200, body: [EPIC] },
			{ status: 200, body: EPIC },
		]);
		await issues.updateType(7, { description: "New text" });
		expect(org[1]?.method).toBe("PUT");
		expect(org[1]?.url).toContain("/issue-types/7");
		expect(org[1]?.body).toEqual({ name: "Epic", is_enabled: true, description: "New text", color: "purple" });
	});

	it("sends only the fields a Type declares: a description and a disabled flag, with no colour", async () => {
		const { issues, org } = make([{ status: 201, body: { ...EPIC, is_enabled: false } }]);
		await issues.createType({ name: "Epic", description: "A body of work", enabled: false });
		expect(org[0]?.body).toEqual({ name: "Epic", is_enabled: false, description: "A body of work" });
	});

	it("sets a colour on a Type that has no description or colour yet, and leaves the missing fields out", async () => {
		const bare = { id: 7, name: "Epic", description: null, color: null, is_enabled: true };
		const { issues, org } = make([
			{ status: 200, body: [bare] },
			{ status: 200, body: bare },
			{ status: 200, body: [bare] },
			{ status: 200, body: bare },
		]);
		await issues.updateType(7, { color: "red" });
		expect(org[1]?.body).toEqual({ name: "Epic", is_enabled: true, color: "red" });
		await issues.updateType(7, {});
		expect(org[3]?.body).toEqual({ name: "Epic", is_enabled: true });
	});

	it("names a Type id the organization lacks", async () => {
		const { issues } = make([{ status: 200, body: [EPIC] }]);
		await expect(issues.updateType(99, { color: "red" })).rejects.toThrow(/no issue Type with id 99/);
	});
});
