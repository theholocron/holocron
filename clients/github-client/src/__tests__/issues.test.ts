import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

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
});
