import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../rest.js";
import { createBackfillApi } from "./github-api.js";

const REPO = "acme/widgets";
const raw = (number: number, over: Record<string, unknown> = {}) => ({
	id: number * 10,
	number,
	title: `Issue ${number}`,
	state: "open",
	labels: [{ name: "bug" }],
	assignee: null,
	updated_at: "2026-01-01T00:00:00Z",
	html_url: "x",
	...over,
});

interface Call {
	method: string;
	url: string;
	body?: unknown;
}
type Answer = { status?: number; body?: unknown };

/** A fake GitHub that answers by `METHOD path` (a GraphQL call by the first word of its query) and records the calls. */
function fake(routes: Record<string, Answer | ((call: Call) => Answer)>) {
	const calls: Call[] = [];
	const fetchFn: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const call: Call = { method: init?.method ?? "GET", url: `${url.pathname}${url.search}`, body };
		calls.push(call);
		const key =
			url.pathname === "/graphql"
				? `GRAPHQL ${String(body.query).match(/(\w+)/)![1]}`
				: `${call.method} ${url.pathname}`;
		const route = routes[key];
		const answer = typeof route === "function" ? route(call) : (route ?? {});
		return new Response(JSON.stringify(answer.body ?? {}), {
			status: answer.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	};
	const client = createGitHubClient({ token: "t", fetch: fetchFn });
	return { api: createBackfillApi(client, client, REPO), calls };
}

describe("createBackfillApi", () => {
	it("lists a page of issues of every state, oldest first, and reads an issue's fields", async () => {
		const { api, calls } = fake({
			"GET /repos/acme/widgets/issues": {
				body: [
					raw(1, {
						type: { name: "Bug" },
						node_id: "N1",
						milestone: { number: 3, title: "v5.0" },
						created_at: "2026-02-01T00:00:00Z",
					}),
					raw(2, { pull_request: {}, state: "closed" }),
				],
			},
		});
		const [first, second] = await api.list(2);
		expect(calls[0].url).toBe(
			"/repos/acme/widgets/issues?state=all&sort=created&direction=asc&per_page=100&page=2"
		);
		expect(first).toEqual({
			number: 1,
			title: "Issue 1",
			state: "open",
			labels: ["bug"],
			type: "Bug",
			milestone: { number: 3, title: "v5.0" },
			nodeId: "N1",
			isPullRequest: false,
			createdAt: "2026-02-01T00:00:00Z",
		});
		expect(second).toMatchObject({
			isPullRequest: true,
			state: "closed",
			type: null,
			milestone: null,
			nodeId: "",
			createdAt: "",
		});
	});

	it("gets one issue", async () => {
		const { api } = fake({ "GET /repos/acme/widgets/issues/5": { body: raw(5) } });
		expect(await api.get(5)).toMatchObject({ number: 5 });
	});

	it("reads a parent's milestone, and null for no parent", async () => {
		const { api } = fake({
			"GET /repos/acme/widgets/issues/1/parent": { body: raw(9, { milestone: { number: 4, title: "v5.0" } }) },
			"GET /repos/acme/widgets/issues/2/parent": { body: raw(8) },
			"GET /repos/acme/widgets/issues/3/parent": { status: 404 },
		});
		expect(await api.parent(1)).toEqual({ number: 9, milestone: 4 });
		expect(await api.parent(2)).toEqual({ number: 8, milestone: null });
		expect(await api.parent(3)).toBeNull();
	});

	it("lists label names in lower case and finds a milestone by title without regard to case", async () => {
		const { api } = fake({
			"GET /repos/acme/widgets/labels": { body: [{ name: "Area:CLI" }] },
			"GET /repos/acme/widgets/milestones": { body: [{ number: 4, title: "V5.0" }] },
		});
		expect(await api.labelNames()).toEqual(new Set(["area:cli"]));
		expect(await api.milestoneNumber("v5.0")).toBe(4);
		expect(await api.milestoneNumber("v6")).toBeUndefined();
	});

	it("finds a project by title", async () => {
		const { api } = fake({
			"GRAPHQL query": {
				body: {
					data: {
						organization: {
							projectsV2: {
								pageInfo: { hasNextPage: false, endCursor: null },
								nodes: [{ id: "P1", title: "v5", number: 1, closed: false, url: "u" }],
							},
						},
					},
				},
			},
		});
		expect(await api.projectId("v5")).toBe("P1");
		expect(await api.projectId("nope")).toBeUndefined();
	});

	it("reads the projects of issues by node id, leaving out what is not an issue", async () => {
		const { api, calls } = fake({
			"GRAPHQL query": {
				body: {
					data: {
						nodes: [
							{
								id: "N1",
								projectItems: { nodes: [{ project: { id: "P1" } }, { project: { id: "P2" } }] },
							},
							{ id: "N2" },
							{},
							null,
						],
					},
				},
			},
		});
		expect(await api.projectsOf(["N1", "N2"])).toEqual(
			new Map([
				["N1", ["P1", "P2"]],
				["N2", []],
			])
		);
		expect(calls[0].body).toMatchObject({ variables: { ids: ["N1", "N2"] } });
	});

	it("reads the organization's issue fields once, and which an issue has a value for", async () => {
		const { api, calls } = fake({
			"GET /orgs/acme/issue-fields": {
				body: [
					{ id: 1, name: "Priority", data_type: "single_select" },
					{ id: 2, name: "Effort", data_type: "single_select" },
				],
			},
			"GET /repos/acme/widgets/issues/5/issue-field-values": {
				body: [
					{ issue_field_id: 1, data_type: "single_select", value: "High" },
					{ issue_field_id: 99, issue_field_name: "Other", data_type: "text", value: "x" },
					{ issue_field_id: 98, data_type: "text", value: "y" },
				],
			},
		});
		expect(await api.fieldNames()).toEqual(new Set(["priority", "effort"]));
		expect(await api.fieldValues(5)).toEqual(new Set(["priority", "other", ""]));
		expect(calls.filter((c) => c.url === "/orgs/acme/issue-fields")).toHaveLength(1);
	});

	it("reports a refused field list as its reason, and throws any other failure", async () => {
		const refused = fake({ "GET /orgs/acme/issue-fields": { status: 403, body: { message: "Forbidden" } } });
		expect(await refused.api.fieldNames()).toBe("GitHub refused: 403");
		const broken = fake({ "GET /orgs/acme/issue-fields": { status: 500, body: { message: "down" } } });
		await expect(broken.api.fieldNames()).rejects.toThrow();
	});

	it("lists the paths a pull request changes", async () => {
		const { api } = fake({
			"GET /repos/acme/widgets/pulls/7/files": { body: [{ filename: "cli/a.ts" }, { filename: "docs/b.md" }] },
		});
		expect(await api.files(7)).toEqual(["cli/a.ts", "docs/b.md"]);
	});

	it("writes a Type, labels, a milestone and a project item", async () => {
		const { api, calls } = fake({});
		await api.setType(5, "Bug");
		await api.addLabels(5, ["area:cli"]);
		await api.setMilestone(5, 4);
		await api.addToProject("P1", "N5");
		expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
			["PATCH", "/repos/acme/widgets/issues/5", { type: "Bug" }],
			["POST", "/repos/acme/widgets/issues/5/labels", { labels: ["area:cli"] }],
			["PATCH", "/repos/acme/widgets/issues/5", { milestone: 4 }],
			["POST", "/graphql", expect.objectContaining({ variables: { project: "P1", content: "N5" } })],
		]);
	});

	it("lists the names of the organization's issue Types, and none when it has none", async () => {
		const { api, calls } = fake({
			"GRAPHQL query": {
				body: { data: { organization: { issueTypes: { nodes: [{ name: "Bug" }, { name: "Task" }] } } } },
			},
		});
		expect(await api.typeNames()).toEqual(new Set(["Bug", "Task"]));
		expect(calls[0].body).toMatchObject({ variables: { org: "acme" } });
		for (const data of [{ organization: { issueTypes: null } }, { organization: null }]) {
			const none = fake({ "GRAPHQL query": { body: { data } } });
			expect(await none.api.typeNames()).toEqual(new Set());
		}
	});

	it("reads a file of the repository as text, and `null` for one it does not have", async () => {
		const { api } = fake({
			"GET /repos/acme/widgets/contents/.holocron/repo.json": {
				body: {
					content: Buffer.from('{"a":1}').toString("base64"),
					encoding: "base64",
					sha: "s",
					name: "repo.json",
					path: "x",
				},
			},
			"GET /repos/acme/widgets/contents/.holocron/repo.ts": { status: 404, body: { message: "Not Found" } },
		});
		expect(await api.readFile(".holocron/repo.json")).toBe('{"a":1}');
		expect(await api.readFile(".holocron/repo.ts")).toBeNull();
	});
});
