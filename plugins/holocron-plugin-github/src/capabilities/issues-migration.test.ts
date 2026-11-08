import type { IssueRecord } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubIssues } from "./issues.js";

const REPO = "theholocron/holocron";

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { issues: new GitHubIssues(createGitHubClient({ token: "pat", fetch }), { repo: REPO }), calls };
}

const raw = (over: Record<string, unknown> = {}) => ({
	id: 1,
	number: 7,
	title: "Fix it",
	body: "details\n\n<!-- holocron:migrated-from https://x/1 -->",
	state: "open",
	labels: [{ name: "bug" }, { name: "priority: High" }, { name: "status:in-progress" }],
	assignee: { login: "luke", name: "Luke" },
	updated_at: "2026-02-01T00:00:00Z",
	created_at: "2026-01-01T00:00:00Z",
	html_url: "https://github.com/theholocron/holocron/issues/7",
	milestone: { number: 3, title: "v2" },
	...over,
});

const links = (parent: number | null, blockers: number[]) => ({
	body: {
		data: {
			repository: {
				issue: {
					parent: parent ? { number: parent } : null,
					blockedBy: { nodes: blockers.map((number) => ({ number })) },
				},
			},
		},
	},
});

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "ENG-1",
	url: "https://linear.app/x/issue/ENG-1",
	title: "From Linear",
	body: "text",
	statusCategory: "open",
	closed: false,
	priority: "urgent",
	labels: ["bug"],
	blockedBy: [],
	comments: [{ author: "Han", body: "hi", createdAt: "2026-01-02T00:00:00Z" }],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-03T00:00:00Z",
	...over,
});

describe("GitHubIssues.export", () => {
	it("reads an issue with comments, priority, parent and blockers", async () => {
		const { issues } = make([
			{ body: raw() },
			{ body: [{ body: "c1", created_at: "2026-01-05T00:00:00Z", user: { login: "leia" } }] },
			links(2, [5]),
		]);
		const [r] = await issues.export({ keys: ["#7"] });
		expect(r).toMatchObject({
			key: "#7",
			title: "Fix it",
			body: "details",
			priority: "high",
			labels: ["bug"],
			statusCategory: "in-progress",
			closed: false,
			milestone: "v2",
			parent: "#2",
			blockedBy: ["#5"],
			assignee: { id: "luke", displayName: "Luke" },
			createdAt: "2026-01-01T00:00:00Z",
		});
		expect(r?.comments).toEqual([{ author: "leia", body: "c1", createdAt: "2026-01-05T00:00:00Z" }]);
	});

	it("fetches a board's issues a few at a time, not all at once, and keeps their order (#1957)", async () => {
		let inFlight = 0;
		let most = 0;
		const fetch = (async (input: string | URL) => {
			inFlight++;
			most = Math.max(most, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			const url = String(input);
			const number = Number(/issues\/(\d+)/.exec(url)?.[1]);
			const body = url.includes("/comments")
				? []
				: url.includes("graphql")
					? { data: { repository: { issue: { parent: null, blockedBy: { nodes: [] } } } } }
					: raw({ number, html_url: `https://github.com/theholocron/holocron/issues/${number}` });
			return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
		}) as typeof globalThis.fetch;
		const issues = new GitHubIssues(createGitHubClient({ token: "pat", fetch }), { repo: REPO });
		const keys = Array.from({ length: 12 }, (_, i) => `#${i + 1}`);

		const out = await issues.export({ keys });

		expect(out.map((r) => r.key)).toEqual(keys);
		expect(most).toBeGreaterThan(1);
		expect(most).toBeLessThanOrEqual(4);
	});

	it("says what a secondary rate limit means, and that nothing was written", async () => {
		const { issues } = make([
			{
				status: 403,
				body: {
					message:
						"You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
					documentation_url:
						"https://docs.github.com/rest/overview/rate-limits-for-the-rest-api#about-secondary-rate-limits",
				},
			},
		]);

		const err = await issues.export({ keys: ["#7"] }).catch((e: unknown) => e);

		expect((err as Error).message).toMatch(/secondary rate limit stopped the export/);
		expect((err as Error).message).toMatch(/nothing has been written/);
	});

	it("passes every other error through as it is", async () => {
		const { issues } = make([{ status: 404, body: { message: "Not Found" } }]);

		const err = await issues.export({ keys: ["#7"] }).catch((e: unknown) => e);

		expect((err as Error).message).toMatch(/404/);
		expect((err as Error).message).not.toMatch(/secondary rate limit/);
	});

	it("lists a milestone, skips pull requests and open-only drops closed ones", async () => {
		const { issues, calls } = make([
			{ body: [{ number: 3, title: "V2" }] },
			{ body: [raw(), raw({ number: 8, pull_request: {} }), raw({ number: 9, state: "closed" })] },
			{ body: [] },
			{ status: 500, body: {} },
		]);
		const out = await issues.export({ milestone: "v2", openOnly: true });
		expect(out.map((r) => r.key)).toEqual(["#7"]);
		expect(calls[1]?.url).toContain("milestone=3");
		expect(out[0]?.blockedBy).toEqual([]);
	});

	it("reads every issue with `all`, and a closed one is done", async () => {
		const { issues } = make([
			{ body: [raw({ state: "closed", labels: [], assignee: null, milestone: null, body: null })] },
			{ body: [] },
			links(null, []),
		]);
		const [r] = await issues.export({ all: true });
		expect(r).toMatchObject({ closed: true, statusCategory: "done" });
		expect(r?.assignee).toBeUndefined();
	});

	it("leaves out issues last changed before `since`, and reports the address of a copy", async () => {
		const { issues } = make([
			{
				body: [
					raw({ number: 1, updated_at: "2026-01-01T00:00:00Z" }),
					raw({ number: 2, updated_at: "2026-03-01T00:00:00Z" }),
				],
			},
			{ body: [] },
			links(null, []),
		]);
		const out = await issues.export({ all: true, since: "2026-02-01T00:00:00Z" });
		expect(out.map((r) => r.key)).toEqual(["#2"]);
		expect(out[0]?.migratedFrom).toBe("https://x/1");
		expect(out[0]?.body).toBe("details");
	});

	it("reports no address for an issue that is not a copy", async () => {
		const { issues } = make([{ body: [raw({ body: "plain" })] }, { body: [] }, links(null, [])]);
		const [r] = await issues.export({ all: true });
		expect(r).not.toHaveProperty("migratedFrom");
	});

	it("fails clearly on an unknown milestone, a bad key and an empty selector", async () => {
		await expect(make([{ body: [] }]).issues.export({ milestone: "nope" })).rejects.toThrow(/not found/);
		await expect(make([]).issues.export({ keys: ["x"] })).rejects.toThrow(/Invalid GitHub issue key/);
		await expect(make([]).issues.export({})).rejects.toThrow(/needs keys/);
	});
});

describe("GitHubIssues.import", () => {
	it("makes the issue with labels, priority label, provenance, comments and closes it", async () => {
		const { issues, calls } = make([
			{ body: [] }, // existing issues
			{ body: [] }, // milestones
			{ body: { number: 4, title: "v2" } }, // createMilestone
			{ body: { number: 12 } }, // createIssue
			{ status: 201, body: {} }, // comment
			{ body: {} }, // close
		]);
		const [res] = await issues.import(
			[record({ closed: true, assignee: { id: "u", displayName: "U" }, parent: "ENG-0", blockedBy: ["ENG-2"] })],
			{ milestone: "v2" }
		);
		expect(res).toMatchObject({ source: "ENG-1", key: "#12", created: true });
		expect(res?.dropped.join(" ")).toMatch(/createdAt.*assignee.*parent.*blockedBy/);
		const create = calls[3]?.body as { labels: string[]; body: string; milestone: number };
		expect(create.labels).toEqual(["bug", "priority: urgent"]);
		expect(create.milestone).toBe(4);
		expect(create.body).toContain("<!-- holocron:migrated-from https://linear.app/x/issue/ENG-1 -->");
		expect((calls[4]?.body as { body: string }).body).toContain("**Han** commented on 2026-01-02");
		expect(calls[5]?.body).toEqual({ state: "closed", state_reason: "completed" });
	});

	it("skips what an earlier run made", async () => {
		const marked = raw({ number: 30, body: "x\n<!-- holocron:migrated-from https://linear.app/x/issue/ENG-1 -->" });
		const { issues, calls } = make([{ body: [marked] }]);
		const [res] = await issues.import([record()]);
		expect(res).toEqual({ source: "ENG-1", key: "#30", created: false, dropped: [] });
		expect(calls).toHaveLength(1);
	});

	it("changes nothing on a dry run, and uses the record's own milestone when none is given", async () => {
		const { issues, calls } = make([{ body: [] }]);
		const [res] = await issues.import([record({ milestone: "m" })], { dryRun: true });
		expect(res?.created).toBe(true);
		expect(res?.key).toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it("takes the record's milestone and an existing one by title, with no priority label for none", async () => {
		const { issues, calls } = make([{ body: [] }, { body: [{ number: 9, title: "M" }] }, { body: { number: 13 } }]);
		await issues.import([record({ milestone: "m", priority: "none", labels: [], comments: [] })]);
		const create = calls[2]?.body as { labels?: string[]; milestone: number };
		expect(create.milestone).toBe(9);
		expect(create.labels).toBeUndefined();
	});
});

describe("GitHubIssues migration — the less common shapes", () => {
	it("export reads the status labels both ways, a plain open issue, a bare assignee and a comment with no user", async () => {
		const bare = (number: number, labels: string[], over: Record<string, unknown> = {}) =>
			raw({ number, labels: labels.map((name) => ({ name })), assignee: null, milestone: null, ...over });
		const { issues } = make([
			{
				body: [
					bare(1, ["status: in review"]),
					bare(2, ["status:in-review"]),
					bare(3, ["status: in progress"]),
					bare(4, ["status:in-progress"]),
					bare(5, ["bug"], {
						assignee: { login: "han", email: "han@x.io" },
						created_at: undefined,
					}),
				],
			},
			...Array.from({ length: 5 }, (_, i) => [
				{ body: i === 4 ? [{ body: "c", created_at: "2026-01-05T00:00:00Z", user: null }] : [] },
				links(null, []),
			]).flat(),
		]);
		const out = await issues.export({ all: true });
		expect(out.map((r) => r.statusCategory)).toEqual([
			"in-review",
			"in-review",
			"in-progress",
			"in-progress",
			"open",
		]);
		expect(out[4]).toMatchObject({
			assignee: { id: "han", displayName: "han", emailAddress: "han@x.io" },
			createdAt: "2026-02-01T00:00:00Z",
		});
		expect(out[4]?.comments).toEqual([{ body: "c", createdAt: "2026-01-05T00:00:00Z" }]);
	});

	it("import makes a record with no body, milestone or comment author, and ignores existing issues with no marker", async () => {
		const { issues, calls } = make([
			{ body: [raw({ number: 40, body: null }), raw({ number: 41, body: "no marker here" })] },
			{ body: { number: 50 } },
			{ status: 201, body: {} },
		]);
		const [res] = await issues.import([
			record({
				body: undefined,
				labels: [],
				priority: undefined,
				comments: [{ body: "anon", createdAt: "2026-01-02T00:00:00Z" }],
			}),
		]);
		expect(res?.key).toBe("#50");
		const create = calls[1]?.body as { body: string; milestone?: number; labels?: string[] };
		expect(create.body.startsWith("---\n_Migrated from")).toBe(true);
		expect(create.milestone).toBeUndefined();
		expect(create.labels).toBeUndefined();
		expect((calls[2]?.body as { body: string }).body).toContain("Someone commented on");
	});

	it("import reads every page of existing issues", async () => {
		const page = Array.from({ length: 100 }, (_, i) =>
			raw({
				number: i + 1,
				body: i === 99 ? "<!-- holocron:migrated-from https://linear.app/x/issue/ENG-1 -->" : "x",
			})
		);
		const { issues, calls } = make([{ body: page }, { body: [] }]);
		const [res] = await issues.import([record()]);
		expect(res).toMatchObject({ created: false, key: "#100" });
		expect(calls).toHaveLength(2);
	});
});
