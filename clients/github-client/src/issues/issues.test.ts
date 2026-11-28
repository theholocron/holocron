import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

const RAW_ISSUE = {
	id: 1,
	number: 42,
	title: "Test issue",
	body: "body",
	state: "open" as const,
	labels: [{ name: "bug" }],
	assignee: null,
	updated_at: "2024-01-01T00:00:00Z",
	html_url: "https://github.com/theholocron/test-repo/issues/42",
};

describe("issues", () => {
	it("GET /repos/{owner}/{name}/issues — no params", async () => {
		const { fetch, calls } = stubFetch([{ body: [RAW_ISSUE] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.issues.listIssues(REPO);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/issues");
		expect(calls[0]?.url).not.toContain("?");
		expect(result).toEqual([RAW_ISSUE]);
	});

	it("GET /repos/{owner}/{name}/issues — with params", async () => {
		const { fetch, calls } = stubFetch([{ body: [RAW_ISSUE] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.listIssues(REPO, {
			state: "open",
			sort: "updated",
			direction: "desc",
			per_page: 50,
			filter: "assigned",
			assignee: "octocat",
		});
		expect(calls[0]?.url).toContain("state=open");
		expect(calls[0]?.url).toContain("sort=updated");
		expect(calls[0]?.url).toContain("direction=desc");
		expect(calls[0]?.url).toContain("per_page=50");
		expect(calls[0]?.url).toContain("filter=assigned");
		expect(calls[0]?.url).toContain("assignee=octocat");
	});

	it("GET /repos/{owner}/{name}/issues/{number}", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.issues.getIssue(REPO, 42);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/issues/42");
		expect(result).toEqual(RAW_ISSUE);
	});

	it("POST /repos/{owner}/{name}/issues", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.createIssue(REPO, { title: "Test issue" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues");
		expect(calls[0]?.body).toMatchObject({ title: "Test issue" });
	});

	it("PATCH /repos/{owner}/{name}/issues/{number}", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.updateIssue(REPO, 42, { state: "closed" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/issues/42");
		expect(calls[0]?.body).toMatchObject({ state: "closed" });
	});

	it("POST /repos/{owner}/{name}/issues/{number}/labels", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.addLabels(REPO, 42, ["bug", "help wanted"]);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues/42/labels");
		expect(calls[0]?.body).toMatchObject({
			labels: ["bug", "help wanted"],
		});
	});

	it("DELETE /repos/{owner}/{name}/issues/{number}/labels/{name}", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.removeLabel(REPO, 42, "bug");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/issues/42/labels/bug");
	});

	it("POST /repos/{owner}/{name}/issues/{number}/comments", async () => {
		const { fetch, calls } = stubFetch([{ status: 201, body: {} }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.createComment(REPO, 42, "Hello!");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues/42/comments");
		expect(calls[0]?.body).toMatchObject({ body: "Hello!" });
	});

	it("GET /repos/{owner}/{name}/milestones — defaults to per_page=100", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.listMilestones(REPO);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/milestones");
		expect(calls[0]?.url).toContain("per_page=100");
	});

	it("GET /repos/{owner}/{name}/milestones — with state param", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.listMilestones(REPO, { state: "closed" });
		expect(calls[0]?.url).toContain("state=closed");
	});

	it("GET issues — page and milestone params", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.listIssues(REPO, { page: 2, milestone: "3" });
		expect(calls[0]?.url).toContain("page=2");
		expect(calls[0]?.url).toContain("milestone=3");
	});

	it("GET issue comments — reads every page", async () => {
		const full = Array.from({ length: 100 }, () => ({ body: "x", created_at: "2024-01-01T00:00:00Z", user: null }));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [full[0]] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const all = await client.issues.listComments(REPO, 42);
		expect(all).toHaveLength(101);
		expect(calls[1]?.url).toContain("/issues/42/comments?per_page=100&page=2");
	});

	it("POST /milestones — creates by title", async () => {
		const { fetch, calls } = stubFetch([{ body: { number: 5, title: "v2" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect((await client.issues.createMilestone(REPO, "v2")).number).toBe(5);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ title: "v2" });
	});

	it("POST sub_issues — adds a sub-issue, and replaces its parent when asked", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }, { body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.addSubIssue(REPO, 7, 99);
		await client.issues.addSubIssue(REPO, 7, 99, true);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues/7/sub_issues");
		expect(calls[0]?.body).toEqual({ sub_issue_id: 99 });
		expect(calls[1]?.body).toEqual({ sub_issue_id: 99, replace_parent: true });
	});

	it("DELETE sub_issue — removes a sub-issue", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.issues.removeSubIssue(REPO, 7, 99);
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/issues/7/sub_issue");
		expect(calls[0]?.body).toEqual({ sub_issue_id: 99 });
	});

	it("GET parent — the parent, or null on a 404", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_ISSUE }, { status: 404, body: { message: "Not Found" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.issues.getParent(REPO, 42)).toEqual(RAW_ISSUE);
		expect(calls[0]?.url).toContain("/issues/42/parent");
		expect(await client.issues.getParent(REPO, 43)).toBeNull();
	});

	it("GET parent — any other failure is thrown", async () => {
		const { fetch } = stubFetch([{ status: 500, body: { message: "boom" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.issues.getParent(REPO, 42)).rejects.toThrow();
	});

	it("dependencies — lists, adds and removes a blocker", async () => {
		const { fetch, calls } = stubFetch([{ body: [RAW_ISSUE] }, { body: RAW_ISSUE }, { body: RAW_ISSUE }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.issues.listBlockedBy(REPO, 42)).toEqual([RAW_ISSUE]);
		await client.issues.addBlockedBy(REPO, 42, 5);
		await client.issues.removeBlockedBy(REPO, 42, 5);
		expect(calls[0]?.url).toContain("/issues/42/dependencies/blocked_by");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.body).toEqual({ issue_id: 5 });
		expect(calls[2]?.method).toBe("DELETE");
		expect(calls[2]?.url).toContain("/issues/42/dependencies/blocked_by/5");
	});
});
