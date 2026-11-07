import type { ProviderRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";
import { fakeLinear, nodes, STATES, TEAM } from "../test-helpers.js";
import { archiveGap, closeGap } from "./automation.js";
import { declaresAnything, parseLinearSetup } from "./provider-config.js";
import { failure } from "./rows.js";

/** A Linear team that keeps what setup writes, so a second run can be compared with the first. */
function workspace(
	over: {
		labels?: Array<{ id: string; name: string; color: string; team: { id: string } | null }>;
		projects?: unknown[];
		automation?: Record<string, unknown>;
		updateFails?: string;
	} = {}
) {
	const state = {
		labels: over.labels ?? [],
		projects: over.projects ?? [],
		automation: {
			autoArchivePeriod: null,
			autoClosePeriod: null,
			autoCloseState: null,
			triageEnabled: false,
			...over.automation,
		},
	};
	const fake = fakeLinear([
		[/teams\(first/, { teams: nodes([TEAM]) }],
		[/workflowStates\(first/, { workflowStates: nodes(STATES) }],
		[/issueLabels\(first/, () => ({ issueLabels: nodes(state.labels) })],
		[
			/issueLabelCreate/,
			(v: Record<string, unknown>) => {
				const input = v.input as { name: string; color?: string; teamId: string };
				const made = {
					id: `l-${input.name}`,
					name: input.name,
					color: input.color ?? "#999",
					team: { id: input.teamId },
				};
				state.labels.push(made);
				return { issueLabelCreate: { issueLabel: made } };
			},
		],
		[/projects\(first/, () => ({ projects: nodes(state.projects) })],
		[
			/projectCreate/,
			(v: Record<string, unknown>) => {
				const input = v.input as { name: string; teamIds: string[] };
				const made = {
					id: "p1",
					name: input.name,
					description: "",
					url: `https://linear.app/acme/project/${input.name}`,
					archivedAt: null,
					status: { id: "ps", name: "Backlog", type: "backlog" },
					teams: { nodes: input.teamIds.map((id) => ({ id, key: "ENG" })) },
				};
				state.projects.push(made);
				return { projectCreate: { project: made } };
			},
		],
		[/team\(id:/, () => ({ team: state.automation })],
		[
			/teamUpdate/,
			(v: Record<string, unknown>) => {
				if (over.updateFails) throw new Error(over.updateFails);
				const input = v.input as {
					autoClosePeriod?: number;
					autoArchivePeriod?: number;
					autoCloseStateId?: string;
				};
				if (input.autoClosePeriod !== undefined)
					state.automation.autoClosePeriod = input.autoClosePeriod as never;
				if (input.autoArchivePeriod !== undefined)
					state.automation.autoArchivePeriod = input.autoArchivePeriod as never;
				if (input.autoCloseStateId) {
					const s = STATES.find((x) => x.id === input.autoCloseStateId)!;
					state.automation.autoCloseState = { id: s.id, name: s.name } as never;
				}
				return { teamUpdate: { team: state.automation } };
			},
		],
	]);
	const writes = () => fake.calls.filter((c) => /mutation/.test(c.document));
	return { ...fake, state, writes };
}

const BLOCK = {
	labels: ["bug", "Custom"],
	project: "Roadmap",
	automation: { autoClose: { months: 3, state: "Canceled" }, autoArchive: { months: 6 } },
};

const plugin = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = BLOCK) =>
	createPlugin({ team: "ENG", cliToken: "lin_api_x", fetch, ...extra });

const byId = (rows: ProviderRow[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("provider linear setup", () => {
	it("makes the labels, the project and the automation, with GitHub's colour for a label it has", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch).setup({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["label:bug", "ok"],
			["label:Custom", "ok"],
			["project", "ok"],
			["autoClose", "ok"],
			["autoArchive", "ok"],
		]);
		expect(ws.state.labels.map((l) => [l.name, l.color])).toEqual([
			["bug", "#d73a4a"],
			["Custom", "#999"],
		]);
		expect(ws.state.projects).toHaveLength(1);
		expect(ws.state.automation).toMatchObject({
			autoClosePeriod: 3,
			autoArchivePeriod: 6,
			autoCloseState: { name: "Canceled" },
		});
		expect(byId(rows)["label:bug"]?.detail).toBe("created");
	});

	it("changes nothing the second time", async () => {
		const ws = workspace();
		const p = plugin(ws.fetch);
		await p.setup({ dryRun: false });
		const before = ws.writes().length;
		const rows = await p.setup({ dryRun: false });
		expect(ws.writes()).toHaveLength(before);
		expect(rows.every((r) => r.status === "ok")).toBe(true);
		expect(byId(rows)["label:bug"]?.detail).toBe("already exists");
		expect(byId(rows).autoClose?.detail).toBe("already set");
	});

	it("leaves an existing label alone whatever its case, and an existing open project", async () => {
		const ws = workspace({
			labels: [{ id: "l", name: "BUG", color: "#123456", team: null }],
			projects: [
				{
					id: "p0",
					name: "Roadmap",
					url: "https://linear.app/p0",
					archivedAt: null,
					teams: { nodes: [{ id: "team1", key: "ENG" }] },
				},
			],
		});
		const rows = await plugin(ws.fetch, { labels: ["bug"], project: "Roadmap" }).setup({ dryRun: false });
		expect(ws.writes()).toHaveLength(0);
		expect(rows.map((r) => r.detail)).toEqual(["already exists", "https://linear.app/p0"]);
		const checked = await plugin(ws.fetch, { labels: ["bug"], project: "Roadmap" }).doctor({ dryRun: false });
		expect(checked.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
	});

	it("makes a new project when the only one with the name is archived or another team's", async () => {
		const ws = workspace({
			projects: [
				{
					id: "a",
					name: "Roadmap",
					url: "u",
					archivedAt: "2026-01-01",
					teams: { nodes: [{ id: "team1", key: "ENG" }] },
				},
				{
					id: "b",
					name: "Roadmap",
					url: "u",
					archivedAt: null,
					teams: { nodes: [{ id: "other", key: "OPS" }] },
				},
			],
		});
		const rows = await plugin(ws.fetch, { project: "Roadmap" }).setup({ dryRun: false });
		expect(rows[0]?.detail).toMatch(/^created: /);
	});

	it("on --dry-run says what it would do and writes nothing", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch).setup({ dryRun: true });
		expect(ws.writes()).toHaveLength(0);
		expect(rows.map((r) => r.detail)).toEqual([
			"would create",
			"would create",
			"would create",
			"would change: auto-close is off, declared 3 months; auto-close state is not set, declared Canceled",
			"would change: auto-archive is off, declared 6 months",
		]);
	});

	it("fails the step, not the run, when a write is refused, and names the key it needs", async () => {
		const ws = workspace({ updateFails: "Forbidden: admin access required" });
		const rows = await plugin(ws.fetch).setup({ dryRun: false });
		const r = byId(rows);
		expect(r["label:bug"]?.status).toBe("ok");
		expect(r.autoClose).toMatchObject({ status: "fail" });
		expect(r.autoClose?.problems[0]).toMatch(/admin for team settings/);
		expect(r.autoArchive?.status).toBe("fail");
	});

	it("fails a close state the team does not have without writing", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, { automation: { autoClose: { months: 1, state: "Nope" } } }).setup({
			dryRun: false,
		});
		expect(rows[0]).toMatchObject({ id: "autoClose", status: "fail" });
		expect(rows[0]?.detail).toMatch(/no state "Nope"/);
		expect(ws.writes()).toHaveLength(0);
	});

	it("sets only the period when no close state is declared", async () => {
		const ws = workspace();
		await plugin(ws.fetch, { automation: { autoClose: { months: 2 } } }).setup({ dryRun: false });
		const sent = ws.writes().find((c) => /teamUpdate/.test(c.document))!;
		expect(sent.variables.input).toEqual({ autoClosePeriod: 2 });
	});

	it("sets auto-archive alone when that is all that is declared, in setup and in the doctor", async () => {
		const ws = workspace();
		const p = plugin(ws.fetch, { automation: { autoArchive: { months: 4 } } });
		expect((await p.setup({ dryRun: false })).map((r) => r.id)).toEqual(["autoArchive"]);
		expect((await p.doctor({ dryRun: false })).map((r) => r.id)).toEqual(["team", "autoArchive"]);
	});

	it("reports git automation as skipped, since it is not applied", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, { automation: { git: [{ event: "merge", state: "Done" }] } }).setup({
			dryRun: false,
		});
		expect(rows).toEqual([expect.objectContaining({ id: "git", status: "skip" })]);
	});

	it("reports a team the token cannot see, and every read that fails", async () => {
		const missing = fakeLinear([[/teams\(first/, { teams: nodes([]) }]]);
		expect((await plugin(missing.fetch).setup({ dryRun: false }))[0]).toMatchObject({ id: "team", status: "fail" });

		const reads = fakeLinear([[/teams\(first/, { teams: nodes([TEAM]) }]]);
		const rows = await plugin(reads.fetch).setup({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["labels", "fail"],
			["project", "fail"],
			["automation", "fail"],
		]);
	});

	it("says nothing was declared instead of passing silently", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, {}).setup({ dryRun: false });
		expect(rows).toEqual([expect.objectContaining({ id: "linear", status: "skip" })]);
		expect(ws.calls).toHaveLength(0);
	});
});

describe("provider linear doctor", () => {
	it("is clean after setup and has a row for every declared setting", async () => {
		const ws = workspace();
		const p = plugin(ws.fetch);
		await p.setup({ dryRun: false });
		const rows = await p.doctor({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["team", "ok"],
			["label:bug", "ok"],
			["label:Custom", "ok"],
			["project", "ok"],
			["autoClose", "ok"],
			["autoArchive", "ok"],
		]);
		expect(byId(rows).autoClose?.detail).toBe("3 months to Canceled");
		expect(ws.writes().filter((c) => /query/.test(c.document))).toHaveLength(0);
	});

	it("fails each setting that differs, with the fix, and writes nothing", async () => {
		const ws = workspace({ automation: { autoClosePeriod: 1, autoArchivePeriod: 6 } });
		const rows = await plugin(ws.fetch).doctor({ dryRun: false });
		const r = byId(rows);
		expect(r["label:bug"]).toMatchObject({ status: "fail", detail: "missing" });
		expect(r.project).toMatchObject({ status: "fail" });
		expect(r.autoClose?.problems).toEqual([
			"auto-close is 1 month, declared 3 months",
			"auto-close state is not set, declared Canceled",
			"run `holocron provider linear setup`",
		]);
		expect(r.autoArchive?.status).toBe("ok");
		expect(ws.writes()).toHaveLength(0);
	});

	it("shows a close period without a state", async () => {
		const ws = workspace({ automation: { autoClosePeriod: 2 } });
		const rows = await plugin(ws.fetch, { automation: { autoClose: { months: 2 } } }).doctor({ dryRun: false });
		expect(byId(rows).autoClose).toMatchObject({ status: "ok", detail: "2 months" });
	});

	it("fails a close state the team does not have, and skips git automation", async () => {
		const ws = workspace();
		const rows = await plugin(ws.fetch, {
			automation: { autoClose: { months: 0, state: "Nope" }, git: [{ event: "start", state: "In Progress" }] },
		}).doctor({ dryRun: false });
		expect(byId(rows).autoClose?.problems[0]).toMatch(/no state "Nope"/);
		expect(byId(rows).git?.status).toBe("skip");
	});

	it("reports an unreadable team and unreadable settings as failing rows", async () => {
		const missing = fakeLinear([[/teams\(first/, { teams: nodes([]) }]]);
		expect(await plugin(missing.fetch).doctor({ dryRun: false })).toEqual([
			expect.objectContaining({ id: "team", status: "fail" }),
		]);
		const reads = fakeLinear([[/teams\(first/, { teams: nodes([TEAM]) }]]);
		const rows = await plugin(reads.fetch).doctor({ dryRun: false });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["team", "ok"],
			["labels", "fail"],
			["project", "fail"],
			["automation", "fail"],
		]);
	});

	it("says nothing was declared", async () => {
		const rows = await plugin(workspace().fetch, {}).doctor({ dryRun: false });
		expect(rows).toEqual([expect.objectContaining({ id: "linear", status: "skip" })]);
	});
});

describe("closeGap and archiveGap", () => {
	const have = {
		autoArchivePeriod: null,
		autoClosePeriod: 1,
		autoCloseState: { id: "s-cancel", name: "Canceled" },
		triageEnabled: false,
	};

	it("word a singular month and a switched-off period", () => {
		expect(closeGap({ months: 0 }, have, STATES as never).problems).toEqual([
			"auto-close is 1 month, declared off",
		]);
		expect(archiveGap({ months: 2 }, have).problems).toEqual(["auto-archive is off, declared 2 months"]);
	});

	it("treat no period and 0 as the same, and a matching state as no difference", () => {
		expect(archiveGap({ months: 0 }, have).problems).toEqual([]);
		expect(closeGap({ months: 1, state: "canceled" }, have, STATES as never)).toEqual({
			problems: [],
			patch: {},
			unresolved: false,
		});
	});
});

describe("failure", () => {
	it("describes a thrown value that is not an Error", () => {
		expect(failure("x", "x", "plain text")).toMatchObject({ detail: "plain text", problems: [] });
	});
});

describe("parseLinearSetup", () => {
	const err = (raw: Parameters<typeof parseLinearSetup>[0]) => {
		try {
			parseLinearSetup(raw);
		} catch (e) {
			return e as Error;
		}
		return undefined;
	};

	it("reads a full block", () => {
		const config = parseLinearSetup({
			team: "ENG",
			labels: ["a", "a", "b"],
			project: "Roadmap",
			automation: {
				autoClose: { months: 3, state: "Canceled" },
				autoArchive: { months: 0 },
				git: [
					{ event: "merge", state: "Done", branch: "main" },
					{ event: "start", state: "In Progress" },
				],
			},
		});
		expect(config).toEqual({
			team: "ENG",
			labels: ["a", "b"],
			project: "Roadmap",
			autoClose: { months: 3, state: "Canceled" },
			autoArchive: { months: 0 },
			git: [
				{ event: "merge", state: "Done", branch: "main" },
				{ event: "start", state: "In Progress" },
			],
		});
		expect(declaresAnything(config)).toBe(true);
	});

	it("declares nothing for a team alone", () => {
		expect(declaresAnything(parseLinearSetup({ team: "ENG" }))).toBe(false);
	});

	it.each([
		[{}, "providers.issues.team must be a non-empty string"],
		[{ team: " " }, "providers.issues.team must be a non-empty string"],
		[{ team: "E", automation: 3 }, "providers.issues.automation must be an object"],
		[{ team: "E", automation: { autoClose: [] } }, "providers.issues.automation.autoClose must be an object"],
		[
			{ team: "E", automation: { autoClose: { months: -1 } } },
			"providers.issues.automation.autoClose.months must be a non-negative integer",
		],
		[
			{ team: "E", automation: { autoClose: { months: 1.5 } } },
			"providers.issues.automation.autoClose.months must be a non-negative integer",
		],
		[
			{ team: "E", automation: { autoClose: { months: 1, state: "" } } },
			"providers.issues.automation.autoClose.state must be a non-empty string",
		],
		[
			{ team: "E", automation: { autoArchive: { months: "6" } } },
			"providers.issues.automation.autoArchive.months must be a non-negative integer",
		],
		[{ team: "E", automation: { git: "x" } }, "providers.issues.automation.git must be an array"],
		[{ team: "E", automation: { git: [3] } }, "providers.issues.automation.git[0] must be an object"],
		[
			{ team: "E", automation: { git: [{ event: "push", state: "Done" }] } },
			"providers.issues.automation.git[0].event must be one of draft, review, start, mergeable, merge",
		],
		[
			{ team: "E", automation: { git: [{ event: "merge", state: "" }] } },
			"providers.issues.automation.git[0].state must be a non-empty string",
		],
		[
			{ team: "E", automation: { git: [{ event: "merge", state: "Done", branch: 1 }] } },
			"providers.issues.automation.git[0].branch must be a non-empty string",
		],
		[{ team: "E", labels: "bug" }, "providers.issues.labels must be an array of names"],
		[{ team: "E", labels: ["ok", ""] }, "providers.issues.labels[1] must be a non-empty string"],
		[{ team: "E", project: 4 }, "providers.issues.project must be a non-empty string"],
	])("rejects %j naming the path", (raw, message) => {
		const e = err(raw as never);
		expect(e?.name).toBe("ConfigError");
		expect(e?.message.startsWith(message)).toBe(true);
	});
});
