import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { PRIORITY_FIELD } from "./issue-fields.testing.js";
import { GitHubIssues } from "./issues.js";

const REPO = "theholocron/holocron";

const EFFORT_FIELD = {
	id: 2,
	name: "Effort",
	data_type: "single_select",
	options: [
		{ id: 21, name: "High" },
		{ id: 22, name: "Medium" },
		{ id: 23, name: "Low" },
	],
};
const START_FIELD = { id: 3, name: "Start date", data_type: "date" };
const TARGET_FIELD = { id: 4, name: "Target date", data_type: "date" };
const FIELDS = [PRIORITY_FIELD, EFFORT_FIELD, START_FIELD, TARGET_FIELD];

const issue = (number: number, over: Record<string, unknown> = {}) => ({
	id: number * 1000,
	number,
	title: `Issue ${number}`,
	body: "text",
	state: "open",
	labels: [],
	assignee: null,
	updated_at: "2026-01-01T00:00:00Z",
	html_url: `https://github.com/${REPO}/issues/${number}`,
	...over,
});

interface Call {
	method: string;
	path: string;
	body?: unknown;
}
type Answer = { status?: number; body?: unknown } | undefined;

/** A fake GitHub: `routes` maps `METHOD /path` to an answer; an unlisted route answers 200 with `{}`. */
function fake(routes: Record<string, Answer | (() => Answer)>) {
	const calls: Call[] = [];
	const fetchFn: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		const path = url.pathname;
		calls.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		const found = routes[`${method} ${path}`];
		const answer = typeof found === "function" ? found() : found;
		const status = answer?.status ?? (method === "DELETE" && path.includes("issue-field-values") ? 204 : 200);
		return new Response(status === 204 ? null : JSON.stringify(answer?.body ?? {}), {
			status,
			headers: { "content-type": "application/json" },
		});
	};
	const client = createGitHubClient({ token: "pat", fetch: fetchFn });
	return { issues: new GitHubIssues(client, { repo: REPO }), calls };
}

const base = `/repos/${REPO}`;
const names = (calls: Call[]) => calls.map((c) => `${c.method} ${c.path.replace(base, "")}`);

describe("GitHubIssues.create with fields", () => {
	it("makes the issue, then sets Type, Priority, Effort, the dates, the parent and the blockers", async () => {
		const { issues, calls } = fake({
			[`POST ${base}/issues`]: { body: issue(50) },
			"GET /orgs/theholocron/issue-fields": { body: FIELDS },
			[`GET ${base}/issues/9`]: { body: issue(9) },
			[`GET ${base}/issues/8`]: { body: issue(8) },
		});
		const result = await issues.create({
			summary: "New",
			kind: "bug",
			priority: "high",
			effort: "medium",
			startDate: "2026-12-01",
			targetDate: "2026-12-31",
			parent: "#9",
			blockedBy: ["#8"],
		});
		expect(result).toEqual({ key: "#50" });
		expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ type: "Bug" });
		const posted = calls.filter((c) => c.path.endsWith("/issue-field-values")).map((c) => c.body);
		expect(posted).toEqual([
			{ issue_field_values: [{ field_id: PRIORITY_FIELD.id, value: "High" }] },
			{ issue_field_values: [{ field_id: 2, value: "Medium" }] },
			{ issue_field_values: [{ field_id: 3, value: "2026-12-01" }] },
			{ issue_field_values: [{ field_id: 4, value: "2026-12-31" }] },
		]);
		const sub = calls.find((c) => c.path === `${base}/issues/9/sub_issues`);
		expect(sub?.body).toEqual({ sub_issue_id: 50000 });
		const dep = calls.find((c) => c.path === `${base}/issues/50/dependencies/blocked_by` && c.method === "POST");
		expect(dep?.body).toEqual({ issue_id: 8000 });
		// A new issue has nothing to read: no values, no parent, no blockers.
		expect(names(calls)).not.toContain("GET /issues/50/parent");
		expect(names(calls)).not.toContain("GET /issues/50/dependencies/blocked_by?per_page=100");
	});

	it("keeps the key and lists what GitHub refused", async () => {
		const { issues } = fake({
			[`POST ${base}/issues`]: { body: issue(50) },
			[`PATCH ${base}/issues/50`]: { status: 422, body: { message: "Invalid type" } },
			"GET /orgs/theholocron/issue-fields": { body: [PRIORITY_FIELD] },
			[`POST ${base}/issues/9/sub_issues`]: { status: 404, body: { message: "Not Found" } },
		});
		const result = await issues.create({
			summary: "New",
			kind: "feature",
			effort: "low",
			parent: "#9",
			blockedBy: ["other/repo#1"],
		});
		expect(result.key).toBe("#50");
		expect(result.dropped).toEqual([
			"kind Feature (GitHub refused: 422)",
			"effort field (theholocron has no Effort issue field)",
			expect.stringContaining("parent #9"),
			expect.stringContaining("blocked by other/repo#1"),
		]);
	});

	it("keeps the key when a field write fails for another reason", async () => {
		const { issues } = fake({
			[`POST ${base}/issues`]: { body: issue(50) },
			"GET /orgs/theholocron/issue-fields": { status: 500, body: { message: "down" } },
		});
		const result = await issues.create({ summary: "New", effort: "low" });
		expect(result.key).toBe("#50");
		expect(result.dropped?.[0]).toMatch(/^fields \(not set: /);
	});
});

describe("GitHubIssues.update", () => {
	it("changes the title, text, state, assignees, milestone and labels that differ", async () => {
		const { issues, calls } = fake({
			[`GET ${base}/issues/7`]: {
				body: issue(7, { labels: [{ name: "bug" }, { name: "cli" }], assignee: { login: "old" } }),
			},
			[`GET ${base}/milestones`]: { body: [{ number: 3, title: "v4.0" }] },
			"GET /user": { body: { login: "octo" } },
		});
		const result = await issues.update("#7", {
			title: "Renamed",
			body: "new text",
			state: "closed",
			assignees: ["me"],
			milestone: "v4.0",
			addLabels: ["area:cli", "bug"],
			removeLabels: ["cli", "nothing"],
		});
		expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
			title: "Renamed",
			body: "new text",
			state: "closed",
			state_reason: "completed",
			assignees: ["octo"],
			milestone: 3,
		});
		expect(calls.find((c) => c.path.endsWith("/labels") && c.method === "POST")?.body).toEqual({
			labels: ["area:cli"],
		});
		expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`${base}/issues/7/labels/cli`);
		expect(result.key).toBe("#7");
		expect(result.changed).toEqual([
			"title",
			"body",
			"state: closed",
			"assignees: octo",
			"milestone: v4.0",
			"labels added: area:cli",
			"label removed: cli",
		]);
	});

	it("writes nothing when the issue is already as asked", async () => {
		const { issues, calls } = fake({
			[`GET ${base}/issues/7`]: {
				body: issue(7, {
					assignee: { login: "Octo" },
					milestone: { number: 3, title: "v4.0" },
					labels: [{ name: "bug" }],
				}),
			},
		});
		const result = await issues.update("7", {
			title: "Issue 7",
			body: "text",
			state: "open",
			assignees: ["octo"],
			milestone: "3",
			addLabels: ["BUG"],
			removeLabels: ["gone"],
		});
		expect(result.changed).toEqual([]);
		expect(names(calls)).toEqual(["GET /issues/7"]);
	});

	it("clears assignees and the milestone only when asked, and not when the issue has none", async () => {
		const full = fake({
			[`GET ${base}/issues/7`]: {
				body: issue(7, { assignee: { login: "a" }, milestone: { number: 3, title: "v4.0" } }),
			},
		});
		const cleared = await full.issues.update("7", { clear: ["assignees", "milestone"] });
		expect(full.calls.find((c) => c.method === "PATCH")?.body).toEqual({ assignees: [], milestone: null });
		expect(cleared.changed).toEqual(["assignees cleared", "milestone cleared"]);

		const empty = fake({ [`GET ${base}/issues/7`]: { body: issue(7) } });
		expect((await empty.issues.update("7", { clear: ["assignees", "milestone"] })).changed).toEqual([]);
		expect(empty.calls.some((c) => c.method === "PATCH")).toBe(false);
	});

	it("leaves a field alone that the patch does not name", async () => {
		const { issues, calls } = fake({ [`GET ${base}/issues/7`]: { body: issue(7) } });
		await issues.update("7", {});
		expect(names(calls)).toEqual(["GET /issues/7"]);
	});

	it("sets a field that differs, replaces a different value and skips an equal one", async () => {
		const { issues, calls } = fake({
			[`GET ${base}/issues/7`]: { body: issue(7, { type: { name: "Task" } }) },
			"GET /orgs/theholocron/issue-fields": { body: FIELDS },
			[`GET ${base}/issues/7/issue-field-values`]: {
				body: [
					{
						issue_field_id: 2,
						data_type: "single_select",
						value: "Low",
						single_select_option: { id: 23, name: "Low", color: "x" },
					},
					{ issue_field_id: 3, data_type: "date", value: "2026-12-01T00:00:00Z" },
				],
			},
		});
		const result = await issues.update("7", {
			kind: "task",
			effort: "high",
			startDate: "2026-12-01",
			targetDate: "2027-01-01",
		});
		expect(result.changed).toEqual(["effort: High", "targetDate: 2027-01-01"]);
		expect(names(calls)).toContain("DELETE /issues/7/issue-field-values/2");
		expect(calls.some((c) => c.method === "PATCH")).toBe(false);
	});

	it("clears the Type and the field values that exist", async () => {
		const { issues, calls } = fake({
			[`GET ${base}/issues/7`]: { body: issue(7, { type: { name: "Bug" } }) },
			"GET /orgs/theholocron/issue-fields": { body: FIELDS },
			[`GET ${base}/issues/7/issue-field-values`]: {
				body: [
					{
						issue_field_id: 2,
						data_type: "single_select",
						value: "Low",
						single_select_option: { id: 23, name: "Low", color: "x" },
					},
				],
			},
		});
		const result = await issues.update("7", { clear: ["kind", "effort", "startDate"] });
		expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ type: null });
		expect(result.changed).toEqual(["kind cleared", "effort cleared"]);
	});

	it("sets a parent, moving it from another one, and takes it off on clear", async () => {
		const moved = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/parent`]: { body: issue(4) },
		});
		expect((await moved.issues.update("7", { parent: "#9" })).changed).toEqual(["parent: #9"]);
		expect(moved.calls.find((c) => c.path.endsWith("/sub_issues"))?.body).toEqual({
			sub_issue_id: 7000,
			replace_parent: true,
		});

		const same = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/parent`]: { body: issue(9) },
		});
		expect((await same.issues.update("7", { parent: "#9" })).changed).toEqual([]);

		const cleared = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/parent`]: { body: issue(4) },
		});
		expect((await cleared.issues.update("7", { clear: ["parent"] })).changed).toEqual(["parent cleared"]);
		expect(cleared.calls.find((c) => c.method === "DELETE")?.body).toEqual({ sub_issue_id: 7000 });

		const none = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/parent`]: { status: 404, body: {} },
		});
		expect((await none.issues.update("7", { clear: ["parent"] })).changed).toEqual([]);
	});

	it("adds a blocker that is missing, skips one that is there, and removes one on unblock", async () => {
		const { issues, calls } = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/dependencies/blocked_by`]: { body: [issue(2), issue(3)] },
			[`GET ${base}/issues/5`]: { body: issue(5) },
		});
		const result = await issues.update("7", { blockedBy: ["#5", "#2"], unblock: ["#3", "#99"] });
		expect(result.changed).toEqual(["blocked by: #5", "unblocked: #3"]);
		expect(calls.find((c) => c.method === "POST")?.body).toEqual({ issue_id: 5000 });
		expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`${base}/issues/7/dependencies/blocked_by/3000`);
	});

	it("drops a field the organization lacks and a key of another repository, and throws on a rate limit", async () => {
		const { issues } = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			"GET /orgs/theholocron/issue-fields": { status: 403, body: { message: "no" } },
		});
		const result = await issues.update("7", { effort: "low", parent: "other/repo#1" });
		expect(result.dropped).toEqual([
			"effort field (GitHub refused: 403)",
			expect.stringContaining("parent other/repo#1"),
		]);

		const limited = fake({
			[`GET ${base}/issues/7`]: { body: issue(7) },
			[`GET ${base}/issues/7/parent`]: { status: 403, body: { message: "API rate limit exceeded" } },
		});
		await expect(limited.issues.update("7", { parent: "#9" })).rejects.toMatchObject({ status: 403 });
	});
});
