import type { ProviderRow } from "@theholocron/cli";
import type { LinearGitAutomationState } from "@theholocron/linear-client";
import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";
import { fakeLinear, nodes, STATES, TEAM } from "../test-helpers.js";
import { gitGaps, knownBranches } from "./git-automation.js";

type Rule = LinearGitAutomationState;

const rule = (over: Partial<Rule> & Pick<Rule, "id" | "event">): Rule => ({
	state: null,
	targetBranch: null,
	...over,
});

/** A Linear team that keeps its git rules, so a second run can be compared with the first. */
function workspace(initial: Rule[] = [], over: { failOn?: RegExp } = {}) {
	const rules = [...initial];
	let seq = 0;
	let branchSeq = 0;
	const branchNames = new Map<string, string>();
	const fake = fakeLinear([
		[/teams\(first/, { teams: nodes([TEAM]) }],
		[/workflowStates\(first/, { workflowStates: nodes(STATES) }],
		[/gitAutomationStates\(first/, () => ({ team: { gitAutomationStates: nodes(rules) } })],
		[
			/gitAutomationTargetBranchCreate/,
			(v: Record<string, unknown>) => {
				if (over.failOn?.test("targetBranch")) throw new Error("Forbidden: admin access required");
				const input = v.input as { branchPattern: string; isRegex?: boolean; teamId: string };
				const id = `b${++branchSeq}`;
				branchNames.set(id, input.branchPattern);
				return {
					gitAutomationTargetBranchCreate: {
						targetBranch: {
							id,
							branchPattern: input.branchPattern,
							isRegex: input.isRegex ?? false,
						},
					},
				};
			},
		],
		[
			/gitAutomationStateCreate/,
			(v: Record<string, unknown>) => {
				const input = v.input as { event: Rule["event"]; stateId: string; targetBranchId?: string };
				const s = STATES.find((x) => x.id === input.stateId)!;
				const made = rule({
					id: `r${++seq}`,
					event: input.event,
					state: { id: s.id, name: s.name },
					targetBranch: input.targetBranchId
						? {
								id: input.targetBranchId,
								branchPattern: branchNames.get(input.targetBranchId) ?? input.targetBranchId,
								isRegex: false,
							}
						: null,
				});
				rules.push(made);
				return { gitAutomationStateCreate: { gitAutomationState: made } };
			},
		],
		[
			/gitAutomationStateUpdate/,
			(v: Record<string, unknown>) => {
				const target = rules.find((r) => r.id === v.id)!;
				const s = STATES.find((x) => x.id === (v.input as { stateId: string }).stateId)!;
				target.state = { id: s.id, name: s.name };
				return { gitAutomationStateUpdate: { gitAutomationState: target } };
			},
		],
	]);
	const writes = () => fake.calls.filter((c) => /mutation/.test(c.document));
	return { ...fake, rules, writes };
}

const plugin = (
	fetch: typeof globalThis.fetch,
	git: Array<{ event: string; state: string; branch?: string }>,
	extra = {}
) => createPlugin({ team: "ENG", cliToken: "lin_api_x", fetch, automation: { git }, ...extra });

const byId = (rows: ProviderRow[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("provider linear git automation", () => {
	it("makes a rule, and the target branch first for a named branch", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, [
			{ event: "start", state: "In Progress" },
			{ event: "merge", state: "Done", branch: "main" },
			{ event: "mergeable", state: "done", branch: "main" },
		]).setup({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["git:start", "ok"],
			["git:merge@main", "ok"],
			["git:mergeable@main", "ok"],
		]);
		const sent = ws.writes().map((c) => c.variables.input);
		expect(sent).toEqual([
			{ teamId: "team1", event: "start", stateId: "s-prog" },
			{ teamId: "team1", branchPattern: "main" },
			{ teamId: "team1", event: "merge", stateId: "s-done", targetBranchId: "b1" },
			{ teamId: "team1", event: "mergeable", stateId: "s-done", targetBranchId: "b1" },
		]);
	});

	it("changes nothing the second time, and the doctor is clean", async () => {
		const ws = workspace();
		const p = plugin(ws.fetch, [
			{ event: "start", state: "In Progress" },
			{ event: "review", state: "In Review", branch: "release" },
		]);
		await p.setup({ dryRun: false });
		const before = ws.writes().length;
		const again = await p.setup({ dryRun: false });
		expect(ws.writes()).toHaveLength(before);
		expect(again.map((r) => r.detail)).toEqual(["already set", "already set"]);
		const rows = await plugin(ws.fetch, [{ event: "start", state: "In Progress" }]).doctor({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["team", "ok"],
			["git:start", "ok"],
		]);
		expect(rows[1]?.detail).toBe("start");
	});

	it("repoints a rule that moves to another state, adopting one made by hand", async () => {
		const ws = workspace([
			rule({ id: "hand", event: "start", state: { id: "s-todo", name: "Todo" } }),
			rule({ id: "none", event: "review", state: null }),
		]);
		const rows = await plugin(ws.fetch, [
			{ event: "start", state: "In Progress" },
			{ event: "review", state: "In Review" },
		]).setup({ dryRun: false });
		expect(rows.map((r) => r.detail)).toEqual([
			"changed: start moves to Todo, declared In Progress",
			"changed: review moves to nothing, declared In Review",
		]);
		expect(ws.writes().map((c) => c.variables)).toEqual([
			{ id: "hand", input: { stateId: "s-prog" } },
			{ id: "none", input: { stateId: "s-review" } },
		]);
	});

	it("reuses a target branch an existing rule already names", async () => {
		const ws = workspace([
			rule({
				id: "r0",
				event: "merge",
				state: { id: "s-done", name: "Done" },
				targetBranch: { id: "bx", branchPattern: "main", isRegex: false },
			}),
		]);
		await plugin(ws.fetch, [{ event: "review", state: "In Review", branch: "main" }]).setup({ dryRun: false });
		expect(ws.writes().map((c) => c.variables.input)).toEqual([
			{ teamId: "team1", event: "review", stateId: "s-review", targetBranchId: "bx" },
		]);
	});

	it("does not take a regular-expression target for a literal branch, or a branch rule for the default", async () => {
		const ws = workspace([
			rule({
				id: "re",
				event: "merge",
				state: { id: "s-done", name: "Done" },
				targetBranch: { id: "bre", branchPattern: "main", isRegex: true },
			}),
			rule({
				id: "other",
				event: "merge",
				state: { id: "s-done", name: "Done" },
				targetBranch: { id: "bo", branchPattern: "dev", isRegex: false },
			}),
		]);
		const rows = await plugin(ws.fetch, [
			{ event: "merge", state: "Done", branch: "main" },
			{ event: "merge", state: "Done" },
		]).doctor({ dryRun: false });
		expect(byId(rows)["git:merge@main"]?.status).toBe("fail");
		expect(byId(rows)["git:merge"]?.status).toBe("fail");
		expect(knownBranches(ws.rules)).toEqual(new Map([["dev", "bo"]]));
	});

	it("on --dry-run says what it would do and writes nothing", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, [{ event: "start", state: "In Progress" }]).setup({ dryRun: true });
		expect(rows[0]?.detail).toBe("would change: no start rule, declared In Progress");
		expect(ws.writes()).toHaveLength(0);
	});

	it("fails a state the team does not have, in setup and in the doctor, without writing", async () => {
		const ws = workspace();
		const p = plugin(ws.fetch, [{ event: "merge", state: "Shipped" }]);
		const rows = await p.setup({ dryRun: false });
		expect(rows[0]).toMatchObject({
			id: "git:merge",
			status: "fail",
			detail: 'the team has no state "Shipped" for merge',
		});
		const checked = await p.doctor({ dryRun: false });
		expect(checked[1]).toMatchObject({ status: "fail" });
		expect(checked[1]?.problems.at(-1)).toBe("run `holocron provider linear setup`");
		expect(ws.writes()).toHaveLength(0);
	});

	it("fails the rule, not the run, when a write is refused", async () => {
		const ws = workspace([], { failOn: /targetBranch/ });
		const rows = await plugin(ws.fetch, [
			{ event: "merge", state: "Done", branch: "main" },
			{ event: "start", state: "In Progress" },
		]).setup({ dryRun: false });
		expect(rows[0]).toMatchObject({ status: "fail" });
		expect(rows[0]?.problems[0]).toMatch(/admin for team settings/);
		expect(rows[1]).toMatchObject({ status: "ok" });
	});

	it("reports unreadable rules as one failing row in setup and in the doctor", async () => {
		const reads = fakeLinear([[/teams\(first/, { teams: nodes([TEAM]) }]]);
		const p = plugin(reads.fetch, [{ event: "start", state: "Todo" }]);
		expect((await p.setup({ dryRun: false })).map((r) => [r.id, r.status])).toEqual([["git", "fail"]]);
		expect((await p.doctor({ dryRun: false })).map((r) => [r.id, r.status])).toEqual([
			["team", "ok"],
			["git", "fail"],
		]);
	});
});

describe("issue templates", () => {
	it("are validated and reported as skipped, in setup and in the doctor", async () => {
		const ws = workspace();
		const p = createPlugin({
			team: "ENG",
			cliToken: "lin_api_x",
			fetch: ws.fetch,
			templates: [{ name: "Bug report", file: ".holocron/linear/bug.md" }],
		});
		const setup = await p.setup({ dryRun: false });
		expect(setup).toEqual([
			expect.objectContaining({
				id: "template:Bug report",
				status: "skip",
				detail: expect.stringContaining("bug.md"),
			}),
		]);
		const doctor = await p.doctor({ dryRun: false });
		expect(doctor.map((r) => [r.id, r.status])).toEqual([
			["team", "ok"],
			["template:Bug report", "skip"],
		]);
		expect(ws.writes()).toHaveLength(0);
	});
});

describe("gitGaps", () => {
	it("compares by event and branch and ignores rules the block does not declare", () => {
		const have = [rule({ id: "x", event: "draft", state: { id: "s-todo", name: "Todo" } })];
		expect(gitGaps([{ event: "start", state: "Todo" }], have, STATES as never)[0]?.action).toEqual({
			kind: "create",
			event: "start",
			stateId: "s-todo",
		});
		expect(gitGaps([], have, STATES as never)).toEqual([]);
	});
});
