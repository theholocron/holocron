import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Item } from "./evaluate-aggregate.fixtures.js";
import { build, crossProduct, run } from "./evaluate-aggregate.fixtures.js";
import { evaluateAggregate } from "./evaluate-aggregate.js";
import type { EvaluateAggregateInput } from "./evaluate-aggregate.type.js";

// The `ci` reusable workflow still polls, with a jq program, for as long as the Sentinel path and the polling job
// coexist (SPEC-0099). This runs that exact program and the function over the same fixtures and requires equal
// verdicts, so neither can change without the other.
const WORKFLOW = fileURLToPath(new URL("../../../../../ci/workflows/ci.yml", import.meta.url));
const hasJq = spawnSync("jq", ["--version"]).status === 0;
// A machine without jq skips; CI always has it and must not skip.
const conformance = hasJq || process.env.CI ? describe : describe.skip;

function jqProgram(): string {
	const match = /--argjson timed_out "\$timed_out" '\n([\s\S]*?)'\)\n\s*\n\s*unsettled=/.exec(
		readFileSync(WORKFLOW, "utf8")
	);
	if (match?.[1] === undefined) throw new Error("the jq program was not found in ci/workflows/ci.yml");
	return match[1];
}

interface JqRow {
	id: string;
	kind: string;
	state: string;
	detail: string;
	url: string | null;
}

function viaJq(program: string, input: EvaluateAggregateInput, timedOut: boolean): JqRow[] {
	// The workflow never waits for itself: it drops `ci` from `expected` before the program.
	const expected = input.expected.filter((id) => id !== "ci");
	const runs = input.checkRuns.map((r) => ({
		id: r.id,
		name: r.name,
		status: r.status,
		conclusion: r.conclusion,
		started_at: r.startedAt,
		url: r.url,
	}));
	const posted = input.commitStatuses.map((s) => ({ context: s.context, state: s.state, url: s.url }));
	const out = spawnSync(
		"jq",
		[
			"-n",
			"-c",
			"--argjson",
			"expected",
			JSON.stringify(expected),
			"--argjson",
			"wanted",
			JSON.stringify(input.statuses),
			"--argjson",
			"runs",
			JSON.stringify(runs),
			"--argjson",
			"posted",
			JSON.stringify(posted),
			"--argjson",
			"timed_out",
			String(timedOut),
			program,
		],
		{ encoding: "utf8" }
	);
	if (out.status !== 0) throw new Error(out.stderr);
	return JSON.parse(out.stdout) as JqRow[];
}

function conclusionOf(rows: Array<{ state: string }>, timedOut: boolean): string {
	if (rows.every((r) => r.state === "success")) return "success";
	const unsettled = rows.some((r) => r.state === "pending" || r.state === "missing");
	return unsettled && !timedOut ? "pending" : "failure";
}

// After the deadline a row nothing posted is a failure; the jq leaves its state `missing`. Same verdict, one spelling.
function normal(rows: JqRow[], timedOut: boolean) {
	return rows.map((r) => ({ ...r, state: timedOut && r.state === "missing" ? "failure" : r.state }));
}

conformance("evaluateAggregate agrees with the workflow's jq program", () => {
	const program = hasJq ? jqProgram() : "";
	const g = (conclusion: string): Item => ({ kind: "run", conclusion });

	const handwritten: Array<[string, Array<[string, Item]>, Array<[string, Item]>]> = [
		[
			"all green",
			[
				["typecheck", g("success")],
				["test:unit", g("skipped")],
			],
			[["codecov/patch", g("success")]],
		],
		[
			"#2171: cancelled first batch, then green",
			[["test:unit", { kind: "reran", older: "cancelled", newer: "success" }]],
			[],
		],
		[
			"#2171: green, then a failed re-run",
			[["test:unit", { kind: "reran", older: "success", newer: "failure" }]],
			[],
		],
		[
			"one id with a failing and a running run",
			[["build", { kind: "pair", first: "failure", second: "running" }]],
			[],
		],
		[
			"one id with a running and then a failing run",
			[["build", { kind: "pair", first: "success", second: "failure" }]],
			[],
		],
		[
			"a status as a check run that failed, a commit status green",
			[["typecheck", g("success")]],
			[["codecov/patch", { kind: "both", run: "failure", state: "success" }]],
		],
		[
			"a status only as a pending commit status",
			[["typecheck", g("success")]],
			[["codecov/patch", { kind: "commit-status", state: "pending" }]],
		],
		[
			"nothing posted",
			[
				["typecheck", { kind: "none" }],
				["test:unit", { kind: "none" }],
			],
			[["codecov/patch", { kind: "none" }]],
		],
		["an unknown conclusion", [["typecheck", g("action_required")]], []],
	];

	for (const timed of ["before", "after"] as const) {
		for (const [label, ids, contexts] of handwritten) {
			it(`${label} (${timed} the deadline)`, () => {
				const input = build(ids, contexts, timed);
				const timedOut = timed === "after";
				const theirs = viaJq(program, input, timedOut);
				const result = evaluateAggregate(input);
				const configRows = result.rows.filter((r) => r.kind === "config");
				expect(configRows).toEqual([]);
				expect(result.rows).toEqual(normal(theirs, timedOut));
				expect(result.conclusion).toBe(conclusionOf(theirs, timedOut));
			});
		}
	}

	it("breaks started_at ties and null started_at the same way", () => {
		const base = build([["t", { kind: "none" }]], [], "before");
		const cases = [
			[run("t / c", "failure", "2026-11-22T10:01:00Z", 1), run("t / c", "success", "2026-11-22T10:01:00Z", 2)],
			[run("t / c", "success", "2026-11-22T10:01:00Z", 2), run("t / c", "failure", "2026-11-22T10:01:00Z", 1)],
			[run("t / c", "success", null, 5), run("t / c", "failure", "2026-11-22T10:01:00Z", 1)],
			[run("t / c", "failure", null, 5), run("t / c", "success", null, 6)],
		];
		for (const checkRuns of cases) {
			const input = { ...base, checkRuns };
			expect(evaluateAggregate(input).rows).toEqual(normal(viaJq(program, input, false), false));
		}
	});

	it("agrees on a sample of the cross product", () => {
		const combos = [...crossProduct(2, 1), ...crossProduct(1, 2)];
		for (let i = 0; i < combos.length; i += 41) {
			const combo = combos[i];
			if (combo === undefined) continue;
			for (const timed of ["before", "after"] as const) {
				const input = build(
					combo.ids.map((item, n): [string, Item] => [`task${n}:leaf`, item]),
					combo.contexts.map((item, n): [string, Item] => [`codecov/s${n}`, item]),
					timed
				);
				const timedOut = timed === "after";
				const theirs = viaJq(program, input, timedOut);
				const result = evaluateAggregate(input);
				expect(result.rows).toEqual(normal(theirs, timedOut));
				expect(result.conclusion).toBe(conclusionOf(theirs, timedOut));
			}
		}
	});
});
