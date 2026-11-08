import { type IssueRecord, ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { LinearIssues } from "./issues.js";
import { isRateLimited } from "./issues-sync.js";

const URL_7 = "https://github.com/o/r/issues/7";
const URL_8 = "https://github.com/o/r/issues/8";

type Routes = Parameters<typeof scopeWith>[0];

function make(routes: Routes = [], wrap?: Parameters<typeof scopeWith>[1]) {
	const s = scopeWith(routes, wrap);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "#7",
	url: URL_7,
	title: "From GitHub",
	body: "text",
	statusCategory: "in-progress",
	closed: false,
	priority: "high",
	labels: ["bug", "new-label"],
	assignee: { id: "luke", displayName: "Luke", emailAddress: "LUKE@x.io" },
	blockedBy: [],
	comments: [{ author: "leia", body: "hi", createdAt: "2026-01-05T00:00:00Z" }],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	...over,
});

const LUKE = { id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" };

/** Routes for a sync: `made` maps a source address to the identifier of the issue already made from it. */
const syncRoutes = (made: Record<string, string>, extra: Routes = []): Routes => [
	...extra,
	[
		/attachmentsForURL/,
		(v: Record<string, unknown>) => ({
			attachmentsForURL: nodes(
				made[v.url as string]
					? [
							{
								id: "a",
								url: v.url,
								title: "Migrated from",
								issue: { id: "i1", identifier: made[v.url as string] },
							},
						]
					: []
			),
		}),
	],
	[/issueLabels\(first/, { issueLabels: nodes([{ id: "l1", name: "Bug", color: "#f00", team: null }]) }],
	[/issueLabelCreate/, { issueLabelCreate: { issueLabel: { id: "l2", name: "new-label" } } }],
	[/users\(first/, { users: nodes([LUKE]) }],
	[
		/issueCreate/,
		(v: Record<string, unknown>) => ({
			issueCreate: { issue: issue({ id: `new-${(v.input as { title: string }).title}`, identifier: "ENG-50" }) },
		}),
	],
	[/attachmentLinkURL/, { attachmentLinkURL: { success: true } }],
	[/commentCreate/, { commentCreate: { comment: { id: "c" } } }],
	[/issueUpdate/, { issueUpdate: { issue: issue() } }],
	[/issue\(id: \$id\) \{ id identifier/, (v: Record<string, unknown>) => ({ issue: current[v.id as string] })],
	[
		/comments\(first/,
		() => ({
			issue: {
				comments: nodes(haveComments.map((c, i) => ({ id: `c${i}`, user: null, ...c }))),
			},
		}),
	],
];

let current: Record<string, ReturnType<typeof issue>> = {};
let haveComments: Array<{ body: string; createdAt: string }> = [];

/** A Linear issue in step with `record()`. */
const inStep = (over: Record<string, unknown> = {}) =>
	issue({
		title: "From GitHub",
		description: "text",
		priority: 2,
		state: { id: "s-prog", name: "In Progress", type: "started" },
		labels: {
			nodes: [
				{ id: "l1", name: "bug" },
				{ id: "l2", name: "New-Label" },
			],
		},
		assignee: LUKE,
		...over,
	});

const LEIA = { body: "**leia** wrote:\n\nhi", createdAt: "2026-01-05T00:00:00Z" };

function given(issues: Record<string, ReturnType<typeof issue>>, comments: typeof haveComments = []) {
	current = issues;
	haveComments = comments;
}

describe("LinearIssues.sync", () => {
	it("makes an issue that is not there, with its attachment and comments", async () => {
		given({});
		const { issues, called } = make(syncRoutes({}));
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ source: "#7", key: "ENG-50", created: true, updated: false, changes: [] });
		expect(called(/attachmentLinkURL/)[0]!.variables).toMatchObject({ url: URL_7, title: "Migrated from #7" });
		expect(called(/commentCreate/)).toHaveLength(1);
	});

	it("updates what differs: title, description, priority, state, labels, assignee, and adds the comment", async () => {
		given({
			"ENG-1": issue({
				title: "Old",
				description: "old",
				priority: 4,
				labels: { nodes: [{ id: "l9", name: "stale" }] },
				assignee: null,
			}),
		});
		const { issues, called } = make(syncRoutes({ [URL_7]: "ENG-1" }));
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ source: "#7", key: "ENG-1", created: false, updated: true });
		expect(res?.changes).toEqual(["title", "description", "priority", "state", "labels", "assignee", "comments"]);
		expect(called(/issueUpdate/)[0]!.variables).toMatchObject({
			id: "i1",
			input: {
				title: "From GitHub",
				description: "text",
				priority: 2,
				stateId: "s-prog",
				labelIds: ["l1", "l2"],
				assigneeId: "u1",
			},
		});
		expect(called(/issueLabelCreate/)).toHaveLength(1);
		expect(called(/commentCreate/)[0]!.variables.input).toMatchObject({ ...LEIA, issueId: "i1" });
	});

	it("leaves an issue that matches alone, and a second run after an update changes nothing", async () => {
		given({ "ENG-1": inStep() }, [LEIA]);
		const { issues, calls } = make(syncRoutes({ [URL_7]: "ENG-1" }));
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ created: false, updated: false, changes: [] });
		expect(calls.filter((c) => /mutation/.test(c.document))).toEqual([]);
	});

	it("finds a copied comment by its time even when the text differs, or by its text when the time does not match", async () => {
		given({ "ENG-1": inStep() }, [{ body: "edited at the source", createdAt: "2026-01-05T00:00:00.000Z" }]);
		const byTime = make(syncRoutes({ [URL_7]: "ENG-1" }));
		await byTime.issues.sync?.([record()]);
		expect(byTime.called(/commentCreate/)).toHaveLength(0);
		given({ "ENG-1": inStep() }, [{ body: LEIA.body, createdAt: "2026-02-01T00:00:00Z" }]);
		const byText = make(syncRoutes({ [URL_7]: "ENG-1" }));
		await byText.issues.sync?.([record()]);
		expect(byText.called(/commentCreate/)).toHaveLength(0);
	});

	it("compares a state by name when the source names one, and by category when it does not", async () => {
		const done = record({ status: "Done", statusCategory: "done", closed: true, comments: [] });
		given({ "ENG-1": inStep({ state: { id: "s-done", name: "Done", type: "completed" } }) });
		const same = make(syncRoutes({ [URL_7]: "ENG-1" }));
		expect(((await same.issues.sync?.([done])) ?? [])[0]?.updated).toBe(false);
		given({ "ENG-1": inStep() });
		const moved = make(syncRoutes({ [URL_7]: "ENG-1" }));
		await moved.issues.sync?.([done]);
		expect(moved.called(/issueUpdate/)[0]!.variables.input).toEqual({ stateId: "s-done" });
		// No name: two "open" states are the same category, so a human's move inside it is not undone.
		given({ "ENG-1": inStep({ state: { id: "s-backlog", name: "Backlog", type: "backlog" } }) });
		const inside = make(syncRoutes({ [URL_7]: "ENG-1" }));
		await inside.issues.sync?.([record({ statusCategory: "open", comments: [] })]);
		expect(inside.called(/issueUpdate/)).toHaveLength(0);
	});

	it("does not set a state the team does not have", async () => {
		given({ "ENG-1": inStep({ state: { id: "s-todo", name: "Todo", type: "unstarted" } }) });
		const { issues, called } = make(
			syncRoutes({ [URL_7]: "ENG-1" }, [[/workflowStates\(first/, { workflowStates: nodes([]) }]])
		);
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res?.changes).not.toContain("state");
		expect(called(/issueUpdate/)).toHaveLength(0);
	});

	it("keeps the Linear assignee when the source has none or has no matching user, and says so", async () => {
		given({ "ENG-1": inStep({ assignee: { id: "u9", name: "Han", displayName: "han", email: "han@x.io" } }) }, [
			LEIA,
		]);
		const none = make(syncRoutes({ [URL_7]: "ENG-1" }));
		const [a] = (await none.issues.sync?.([record({ assignee: undefined })])) ?? [];
		expect(a?.changes).toEqual([]);
		const unmatched = make(syncRoutes({ [URL_7]: "ENG-1" }));
		const [b] = (await unmatched.issues.sync?.([record({ assignee: { id: "x", displayName: "X" } })])) ?? [];
		expect(b?.dropped).toContain("assignee (no Linear user with that email)");
		expect(b?.changes).toEqual([]);
	});

	it("changes nothing on a dry run, create or update", async () => {
		given({ "ENG-1": issue({ title: "Old", labels: { nodes: [] } }) });
		const { issues, calls } = make(syncRoutes({ [URL_7]: "ENG-1" }));
		const out = (await issues.sync?.([record(), record({ key: "#8", url: URL_8 })], { dryRun: true })) ?? [];
		expect(out.map((r) => [r.source, r.created, r.updated])).toEqual([
			["#7", false, true],
			["#8", true, false],
		]);
		expect(out[0]?.changes).toContain("labels");
		expect(calls.filter((c) => /mutation/.test(c.document))).toEqual([]);
	});

	it("stops cleanly on a rate limit while making issues, returning the ones done", async () => {
		given({});
		let creates = 0;
		const { issues } = make(syncRoutes({}), (fetch) => async (url, init) => {
			if (/issueCreate/.test(String(init?.body)) && ++creates === 2) return new Response("{}", { status: 429 });
			return fetch(url, init);
		});
		const out =
			(await issues.sync?.([record(), record({ key: "#8", url: URL_8 }), record({ key: "#9", url: "u9" })])) ??
			[];
		expect(out.map((r) => r.source)).toEqual(["#7"]);
		expect(out[0]).toMatchObject({ created: true, updated: false });
	});

	it("stops cleanly on a rate limit while updating, returning the ones done in the source's order", async () => {
		given({ "ENG-1": issue({ title: "Old" }), "ENG-2": issue({ title: "Old" }) });
		let updates = 0;
		const { issues } = make(
			syncRoutes({ [URL_7]: "ENG-1", [URL_8]: "ENG-2" }),
			(fetch) => async (url, init) =>
				/issueUpdate/.test(String(init?.body)) && ++updates === 2
					? new Response("{}", { status: 429 })
					: fetch(url, init)
		);
		const out = (await issues.sync?.([record(), record({ key: "#8", url: URL_8 })])) ?? [];
		expect(out.map((r) => r.source)).toEqual(["#7"]);
		expect(out[0]?.updated).toBe(true);
	});

	it("stops on a rate limit named in the GraphQL errors, and rethrows any other failure", async () => {
		given({});
		const limited = make(
			syncRoutes({}),
			(fetch) => async (url, init) =>
				/attachmentsForURL/.test(String(init?.body))
					? new Response(JSON.stringify({ errors: [{ message: "Rate limit exceeded" }] }))
					: fetch(url, init)
		);
		expect(await limited.issues.sync?.([record()])).toEqual([]);
		const broken = make(
			syncRoutes({}),
			(fetch) => async (url, init) =>
				/attachmentsForURL/.test(String(init?.body))
					? new Response(JSON.stringify({ errors: [{ message: "boom" }] }))
					: fetch(url, init)
		);
		await expect(broken.issues.sync?.([record()])).rejects.toThrow(/boom/);
	});

	it("treats a missing description and an empty one as the same, and clears one the source emptied", async () => {
		given({ "ENG-1": inStep({ description: null }) }, [LEIA]);
		const same = make(syncRoutes({ [URL_7]: "ENG-1" }));
		expect(((await same.issues.sync?.([record({ body: undefined })])) ?? [])[0]?.updated).toBe(false);
		given({ "ENG-1": inStep() }, [LEIA]);
		const cleared = make(syncRoutes({ [URL_7]: "ENG-1" }));
		await cleared.issues.sync?.([record({ body: undefined })]);
		expect(cleared.called(/issueUpdate/)[0]!.variables.input).toEqual({ description: "" });
	});

	it("takes no options", async () => {
		given({});
		const { issues } = make(syncRoutes({}));
		const [res] = (await issues.sync?.([record({ comments: [] })])) ?? [];
		expect(res?.created).toBe(true);
	});
});

describe("isRateLimited", () => {
	it("is true for a 429 and for an error that names the rate limit, false for anything else", () => {
		expect(isRateLimited(new ProviderApiError("x", 429))).toBe(true);
		expect(isRateLimited(new ProviderApiError("Linear GraphQL → Rate limit exceeded", 200))).toBe(true);
		expect(isRateLimited(new ProviderApiError("Linear GraphQL → ratelimited", 200))).toBe(true);
		expect(isRateLimited(new ProviderApiError("x", 500))).toBe(false);
		expect(isRateLimited(new Error("rate limit"))).toBe(false);
	});
});

describe("LinearIssues.export for a sync", () => {
	it("reads the address a migrate or sync recorded, and ignores other attachments", async () => {
		const routes: Routes = [
			[
				/issues\(first/,
				{
					issues: nodes([
						issue({
							attachments: nodes([
								{ url: "https://github.com/o/r/pull/3", title: "PR" },
								{ url: URL_7, title: "Migrated from #7" },
							]),
						}),
						issue({ id: "i2", identifier: "ENG-2", attachments: nodes([{ url: "x", title: "PR" }]) }),
						issue({ id: "i3", identifier: "ENG-3" }),
					]),
				},
			],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		];
		const { issues } = make(routes);
		const out = (await issues.export({ all: true })) ?? [];
		expect(out.map((r) => r.migratedFrom)).toEqual([URL_7, undefined, undefined]);
		expect(out[1]).not.toHaveProperty("migratedFrom");
	});

	it("leaves out issues changed before `since`", async () => {
		const { issues } = make([
			[
				/issues\(first/,
				{
					issues: nodes([
						issue({ updatedAt: "2026-01-01T00:00:00Z" }),
						issue({ id: "i2", identifier: "ENG-2", updatedAt: "2026-03-01T00:00:00Z" }),
					]),
				},
			],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		]);
		const out = await issues.export({ all: true, since: "2026-02-01T00:00:00Z" });
		expect(out.map((r) => r.key)).toEqual(["ENG-2"]);
	});
});
