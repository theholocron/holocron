import { ProviderApiError } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { createLinearClient } from "./index.js";
import { data, page, stubFetch } from "./test-helpers.js";

const issue = { id: "i1", identifier: "ENG-1", title: "t" };

describe("createLinearClient", () => {
	it("sends a personal key as the bare authorization value", async () => {
		const { fetch, calls } = stubFetch([data({ viewer: { id: "u" }, organization: { id: "o" } })]);
		await createLinearClient({ token: "lin_api_x", fetch }).teams.viewer();
		expect(calls[0]?.url).toBe("https://api.linear.app/graphql");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.headers.authorization).toBe("lin_api_x");
	});

	it("sends an OAuth token as a bearer", async () => {
		const { fetch, calls } = stubFetch([data({ viewer: { id: "u" }, organization: { id: "o" } })]);
		await createLinearClient({ token: "lin_oauth_x", fetch }).teams.viewer();
		expect(calls[0]?.headers.authorization).toBe("Bearer lin_oauth_x");
	});

	it("turns a GraphQL error into a ProviderApiError", async () => {
		const { fetch } = stubFetch([{ body: { errors: [{ message: "Entity not found" }] } }]);
		const err = await createLinearClient({ token: "t", fetch })
			.issues.get("ENG-9")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as Error).message).toMatch(/Entity not found/);
	});
});

describe("teams", () => {
	it("lists teams across pages and finds one by key, name or id", async () => {
		const { fetch, calls } = stubFetch([
			data({ teams: page([{ id: "t1", key: "ENG", name: "Engineering" }], "c1") }),
			data({ teams: page([{ id: "t2", key: "OPS", name: "Operations" }]) }),
			data({ teams: page([{ id: "t1", key: "ENG", name: "Engineering" }]) }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect(await c.teams.list()).toHaveLength(2);
		expect((calls[1]?.body as { variables: { after: string } }).variables.after).toBe("c1");
		expect((await c.teams.find("eng"))?.id).toBe("t1");
	});

	it("reads automation, sorts states by position and makes states and labels", async () => {
		const { fetch, calls } = stubFetch([
			data({
				team: {
					autoArchivePeriod: 6,
					autoClosePeriod: null,
					autoCloseStateId: null,
					triageEnabled: false,
					states: { nodes: [] },
				},
			}),
			data({
				workflowStates: page([
					{ id: "b", name: "Done", type: "completed", position: 2 },
					{ id: "a", name: "Todo", type: "unstarted", position: 1 },
				]),
			}),
			data({ workflowStateCreate: { workflowState: { id: "n", name: "Blocked" } } }),
			data({ issueLabels: page([{ id: "l", name: "bug", color: "#f00", team: null }]) }),
			data({ issueLabelCreate: { issueLabel: { id: "l2", name: "x" } } }),
			data({ users: page([{ id: "u", name: "A", displayName: "a" }]) }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		const automation = await c.teams.automation("t1");
		expect(automation).toEqual({
			autoArchivePeriod: 6,
			autoClosePeriod: null,
			autoCloseState: null,
			triageEnabled: false,
		});
		// Linear's `Team` has `autoCloseStateId`, not `autoCloseState`: asking for the latter is a 400 (#1944).
		const sent = calls[0]?.body as { query: string };
		expect(sent.query).toMatch(/autoCloseStateId/);
		expect(sent.query).not.toMatch(/autoCloseState \{/);
		expect((await c.teams.states("t1")).map((s) => s.name)).toEqual(["Todo", "Done"]);
		expect((await c.teams.createState("t1", { name: "Blocked", type: "started" })).id).toBe("n");
		expect((calls[2]?.body as { variables: { input: { color: string } } }).variables.input.color).toBe("#95a2b3");
		expect(await c.teams.labels("t1")).toHaveLength(1);
		expect((await c.teams.createLabel({ name: "x" })).id).toBe("l2");
		expect(await c.teams.users()).toHaveLength(1);
	});

	it("updates the team's automation with only the fields given", async () => {
		const wire = {
			autoArchivePeriod: 6,
			autoClosePeriod: 3,
			autoCloseStateId: "s",
			triageEnabled: false,
			states: {
				nodes: [
					{ id: "other", name: "Todo" },
					{ id: "s", name: "Canceled" },
				],
			},
		};
		const after = {
			autoArchivePeriod: 6,
			autoClosePeriod: 3,
			autoCloseState: { id: "s", name: "Canceled" },
			triageEnabled: false,
		};
		const { fetch, calls } = stubFetch([data({ teamUpdate: { team: wire } })]);
		const team = await createLinearClient({ token: "t", fetch }).teams.updateAutomation("t1", {
			autoClosePeriod: 3,
			autoCloseStateId: "s",
		});
		expect(team).toEqual(after);
		const sent = calls[0]?.body as { query: string; variables: { id: string; input: unknown } };
		expect(sent.query).toMatch(/teamUpdate\(id: \$id, input: \$input\)/);
		expect(sent.variables).toEqual({ id: "t1", input: { autoClosePeriod: 3, autoCloseStateId: "s" } });
	});

	it("names a close state that is not among the first states by its id", async () => {
		const { fetch } = stubFetch([
			data({
				team: {
					autoArchivePeriod: 0,
					autoClosePeriod: 1,
					autoCloseStateId: "gone",
					triageEnabled: true,
					states: { nodes: [] },
				},
			}),
		]);
		const team = await createLinearClient({ token: "t", fetch }).teams.automation("t1");
		expect(team.autoCloseState).toEqual({ id: "gone", name: "gone" });
	});

	it("reads workspace-wide labels without a team filter", async () => {
		const { fetch, calls } = stubFetch([data({ issueLabels: page([]) })]);
		await createLinearClient({ token: "t", fetch }).teams.labels();
		expect((calls[0]?.body as { variables: { filter?: unknown } }).variables.filter).toBeUndefined();
	});
});

describe("git automation", () => {
	const rule = { id: "r", event: "merge", state: { id: "s", name: "Done" }, targetBranch: null };

	it("reads the team's rules, pages them and makes and repoints them", async () => {
		const branch = { id: "b", branchPattern: "main", isRegex: false };
		const { fetch, calls } = stubFetch([
			data({ team: { gitAutomationStates: page([rule], "c1") } }),
			data({ team: { gitAutomationStates: page([{ ...rule, id: "r2" }]) } }),
			data({ gitAutomationTargetBranchCreate: { targetBranch: branch } }),
			data({ gitAutomationStateCreate: { gitAutomationState: rule } }),
			data({ gitAutomationStateUpdate: { gitAutomationState: { ...rule, id: "r3" } } }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect((await c.teams.gitAutomation("t1")).map((r) => r.id)).toEqual(["r", "r2"]);
		expect(await c.teams.createGitTargetBranch({ teamId: "t1", branchPattern: "main" })).toEqual(branch);
		expect((await c.teams.createGitAutomation({ teamId: "t1", event: "merge", stateId: "s" })).id).toBe("r");
		expect((await c.teams.updateGitAutomation("r3", { stateId: "s" })).id).toBe("r3");
		const sent = (i: number) => calls[i]?.body as { query: string; variables: Record<string, unknown> };
		expect(sent(0).query).toMatch(/gitAutomationStates\(first: 100/);
		expect(sent(2).query).toMatch(/gitAutomationTargetBranchCreate\(input: \$input\)/);
		expect(sent(3).variables).toEqual({ input: { teamId: "t1", event: "merge", stateId: "s" } });
		expect(sent(4).variables).toEqual({ id: "r3", input: { stateId: "s" } });
	});

	it("sends a null auto-close period to switch it off", async () => {
		const { fetch, calls } = stubFetch([
			data({
				teamUpdate: {
					team: {
						autoArchivePeriod: 6,
						autoClosePeriod: null,
						autoCloseStateId: null,
						triageEnabled: false,
						states: { nodes: [] },
					},
				},
			}),
		]);
		await createLinearClient({ token: "t", fetch }).teams.updateAutomation("t1", { autoClosePeriod: null });
		expect((calls[0]?.body as { variables: { input: unknown } }).variables.input).toEqual({
			autoClosePeriod: null,
		});
	});
});

describe("issues", () => {
	it("filters, pages and stops at the limit", async () => {
		const { fetch, calls } = stubFetch([
			data({ issues: page([issue, issue], "c1") }),
			data({ issues: page([issue]) }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		const all = await c.issues.list({ teamId: "t", projectId: "p", assigneeId: "u", openOnly: true });
		expect(all).toHaveLength(3);
		const vars = (calls[0]?.body as { variables: { filter: Record<string, unknown> } }).variables;
		expect(Object.keys(vars.filter).sort()).toEqual(["assignee", "project", "state", "team"]);
	});

	it("honours the limit", async () => {
		const { fetch } = stubFetch([data({ issues: page([issue, issue, issue], "c1") })]);
		expect(await createLinearClient({ token: "t", fetch }).issues.list({ limit: 2 })).toHaveLength(2);
	});

	it("gets, creates and updates", async () => {
		const { fetch, calls } = stubFetch([
			data({ issue }),
			data({ issueCreate: { issue } }),
			data({ issueUpdate: { issue } }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect((await c.issues.get("ENG-1")).identifier).toBe("ENG-1");
		await c.issues.create({ teamId: "t", title: "x", priority: 2, createdAt: "2024-01-01T00:00:00Z" });
		await c.issues.update("i1", { stateId: "s" });
		expect((calls[1]?.body as { variables: { input: { priority: number } } }).variables.input.priority).toBe(2);
		expect((calls[2]?.body as { variables: { id: string } }).variables.id).toBe("i1");
	});

	it("reads and adds comments, relations and attachments", async () => {
		const { fetch, calls } = stubFetch([
			data({ issue: { comments: page([{ id: "c", body: "hi" }]) } }),
			data({ commentCreate: { comment: { id: "c2", body: "yo" } } }),
			data({ issueRelationCreate: { success: true } }),
			data({ attachmentLinkURL: { success: true } }),
			data({
				attachmentsForURL: page([{ id: "a", url: "u", title: "t", issue: { id: "i", identifier: "ENG-1" } }]),
			}),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect(await c.issues.comments("i1")).toHaveLength(1);
		await c.issues.comment("i1", "yo", "2024-01-01T00:00:00Z");
		await c.issues.relate("i1", "i2", "blocks");
		await c.issues.attach("i1", "https://github.com/a/b/issues/1", "GitHub");
		expect((await c.issues.attachmentsForUrl("u"))[0]?.issue.identifier).toBe("ENG-1");
		expect((calls[1]?.body as { variables: { input: { createdAt: string } } }).variables.input.createdAt).toBe(
			"2024-01-01T00:00:00Z"
		);
		expect((calls[2]?.body as { variables: { input: { type: string } } }).variables.input.type).toBe("blocks");
	});
});

describe("projects", () => {
	it("lists, creates, archives and unarchives", async () => {
		const { fetch, calls } = stubFetch([
			data({ projects: page([{ id: "p", name: "Roadmap" }]) }),
			data({ projectStatuses: page([{ id: "s", name: "Planned", type: "planned" }]) }),
			data({ projectCreate: { project: { id: "p2", name: "New" } } }),
			data({ projectArchive: { success: true } }),
			data({ projectUnarchive: { success: true } }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect(await c.projects.list()).toHaveLength(1);
		expect((await c.projects.statuses())[0]?.type).toBe("planned");
		expect((await c.projects.create({ name: "New", teamIds: ["t"] })).id).toBe("p2");
		await c.projects.archive("p2");
		await c.projects.unarchive("p2");
		expect(calls).toHaveLength(5);
	});
});

describe("client edge cases", () => {
	it("comments without a backdate send no createdAt", async () => {
		const { fetch, calls } = stubFetch([data({ commentCreate: { comment: { id: "c" } } })]);
		await createLinearClient({ token: "t", fetch }).issues.comment("i1", "hi");
		expect(calls[0]?.body).toMatchObject({ variables: { input: { issueId: "i1", body: "hi" } } });
		expect((calls[0]?.body as { variables: { input: object } }).variables.input).not.toHaveProperty("createdAt");
	});

	it("finds a team by id or by name, and returns undefined for an unknown one", async () => {
		const team = { id: "t1", key: "ENG", name: "Engineering" };
		const { fetch } = stubFetch([
			data({ teams: page([team]) }),
			data({ teams: page([team]) }),
			data({ teams: page([team]) }),
		]);
		const c = createLinearClient({ token: "t", fetch });
		expect((await c.teams.find("t1"))?.key).toBe("ENG");
		expect((await c.teams.find("engineering"))?.key).toBe("ENG");
		expect(await c.teams.find("nope")).toBeUndefined();
	});
});
