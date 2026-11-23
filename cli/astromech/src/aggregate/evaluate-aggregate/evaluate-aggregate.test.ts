import { describe, expect, it } from "vitest";

import type { Item } from "./evaluate-aggregate.fixtures.js";
import {
	build,
	crossProduct,
	ID_ITEMS,
	inputFor,
	run,
	STATUS_ITEMS,
	T0,
	TIMEOUT,
} from "./evaluate-aggregate.fixtures.js";
import { evaluateAggregate } from "./evaluate-aggregate.js";
import { oracleSucceeds } from "./evaluate-aggregate.oracle.js";

const GREEN: Item = { kind: "run", conclusion: "success" };

describe("evaluateAggregate oracle", () => {
	const sizes: Array<[number, number]> = [
		[1, 0],
		[2, 1],
		[3, 0],
		[1, 2],
		[2, 2],
	];
	for (const [idCount, statusCount] of sizes) {
		it(`succeeds exactly when everything is satisfied (${idCount} ids, ${statusCount} statuses)`, () => {
			let successes = 0;
			for (const combo of crossProduct(idCount, statusCount)) {
				for (const timed of ["before", "after"] as const) {
					const result = evaluateAggregate(inputFor(combo, timed));
					const want = oracleSucceeds(combo.ids, combo.contexts);
					if ((result.conclusion === "success") !== want) {
						throw new Error(
							`${JSON.stringify(combo)} ${timed}: got ${result.conclusion}, oracle says ${want}`
						);
					}
					if (timed === "after" && result.conclusion === "pending") {
						throw new Error(`${JSON.stringify(combo)}: pending after the deadline`);
					}
					if (want) successes += 1;
				}
			}
			expect(successes).toBeGreaterThan(0);
		});
	}

	it("accepts the empty case only as a failure", () => {
		expect(oracleSucceeds([], [])).toBe(false);
	});
});

describe("evaluateAggregate monotonicity", () => {
	const ids: Array<[string, Item]> = [
		["typecheck", GREEN],
		["test:unit", GREEN],
		["lint:code", { kind: "run", conclusion: "skipped" }],
	];
	const contexts: Array<[string, Item]> = [
		["codecov/patch", GREEN],
		["codecov/project", { kind: "commit-status", state: "success" }],
	];
	const worse: Item[] = [
		{ kind: "none" },
		{ kind: "running" },
		{ kind: "run", conclusion: "failure" },
		{ kind: "run", conclusion: "cancelled" },
	];

	it("starts from a success", () => {
		expect(evaluateAggregate(build(ids, contexts, "before")).conclusion).toBe("success");
	});

	for (const timed of ["before", "after"] as const) {
		it(`never succeeds when any one row gets worse (${timed} the deadline)`, () => {
			for (let i = 0; i < ids.length + contexts.length; i++) {
				for (const item of worse) {
					const nextIds = ids.map((entry, index): [string, Item] => (index === i ? [entry[0], item] : entry));
					const nextContexts = contexts.map((entry, index): [string, Item] =>
						index + ids.length === i ? [entry[0], item] : entry
					);
					expect(evaluateAggregate(build(nextIds, nextContexts, timed)).conclusion).not.toBe("success");
				}
			}
		});
	}

	it("never succeeds when an id is added that nothing posts", () => {
		const result = evaluateAggregate(build([...ids, ["deploy", { kind: "none" }]], contexts, "before"));
		expect(result.conclusion).toBe("pending");
		expect(evaluateAggregate(build([...ids, ["deploy", { kind: "none" }]], contexts, "after")).conclusion).toBe(
			"failure"
		);
	});

	it("never succeeds when a status context is added that nothing posts", () => {
		expect(evaluateAggregate(build(ids, [...contexts, ["codecov/x", { kind: "none" }]], "after")).conclusion).toBe(
			"failure"
		);
	});
});

describe("evaluateAggregate timeout", () => {
	const waiting = (timed: "before" | "after") =>
		evaluateAggregate(
			build(
				[
					["typecheck", GREEN],
					["test:unit", { kind: "running" }],
					["deploy", { kind: "none" }],
				],
				[],
				timed
			)
		);

	it("is pending while checks are running or missing before the deadline", () => {
		const result = waiting("before");
		expect(result.conclusion).toBe("pending");
		expect(result.rows.map((r) => r.state)).toEqual(["success", "pending", "missing"]);
	});

	it("fails at the deadline, naming the running and the missing ones", () => {
		const result = waiting("after");
		expect(result.conclusion).toBe("failure");
		expect(result.rows.map((r) => [r.state, r.detail])).toEqual([
			["success", "success"],
			["failure", "timed out while still running"],
			["failure", "never posted"],
		]);
	});

	it("measures from startedAt, so a late sweep gets the same answer a webhook would", () => {
		const input = build([["typecheck", { kind: "running" }]], [], "before");
		expect(evaluateAggregate({ ...input, now: T0 + TIMEOUT - 1 }).conclusion).toBe("pending");
		expect(evaluateAggregate({ ...input, now: T0 + TIMEOUT }).conclusion).toBe("failure");
		expect(evaluateAggregate({ ...input, now: T0 + 10 * TIMEOUT }).conclusion).toBe("failure");
	});
});

describe("evaluateAggregate fails closed", () => {
	it("fails on an empty expected list, even when every status is green", () => {
		const result = evaluateAggregate(build([], [["codecov/patch", GREEN]], "before"));
		expect(result.conclusion).not.toBe("success");
		expect(result.rows[0]).toMatchObject({ id: "expected", kind: "config", state: "failure" });
	});

	it("never succeeds with an incomplete read, however green the rest is", () => {
		const input = { ...build([["typecheck", GREEN]], [], "before"), incomplete: "more than 1000 check runs" };
		const result = evaluateAggregate(input);
		expect(result.conclusion).toBe("failure");
		expect(result.summary).toContain("more than 1000 check runs");
	});

	it("treats a clock it cannot read as past the deadline", () => {
		const input = build([["typecheck", { kind: "running" }]], [], "before");
		expect(evaluateAggregate({ ...input, now: Number.NaN }).conclusion).toBe("failure");
		expect(evaluateAggregate({ ...input, startedAt: Number.NaN }).conclusion).toBe("failure");
	});

	it("does not match a name that merely starts like an id", () => {
		const input = build([["lint", { kind: "none" }]], [], "after");
		input.checkRuns.push(run("lint:code / Conclusion", "success", "2026-11-22T10:01:00Z", 900));
		expect(evaluateAggregate(input).conclusion).toBe("failure");
	});

	it("does not read a conclusion it does not know as a pass", () => {
		const input = build([["typecheck", { kind: "run", conclusion: "action_required" }]], [], "before");
		expect(evaluateAggregate(input).conclusion).toBe("failure");
	});
});

describe("evaluateAggregate newest run wins (#2171)", () => {
	it("passes when a failed run was re-run to green", () => {
		const input = build([["test:unit", { kind: "reran", older: "failure", newer: "success" }]], [], "before");
		expect(evaluateAggregate(input).conclusion).toBe("success");
	});

	it("fails when a green run was followed by a failure", () => {
		const input = build([["test:unit", { kind: "reran", older: "success", newer: "failure" }]], [], "before");
		expect(evaluateAggregate(input).conclusion).toBe("failure");
	});

	it("breaks a started_at tie by id, and a missing started_at loses to a set one", () => {
		const base = build([["t", { kind: "none" }]], [], "before");
		const tie = [
			run("t / c", "failure", "2026-11-22T10:01:00Z", 1),
			run("t / c", "success", "2026-11-22T10:01:00Z", 2),
		];
		expect(evaluateAggregate({ ...base, checkRuns: tie }).conclusion).toBe("success");
		const nullStart = [run("t / c", "success", null, 5), run("t / c", "failure", "2026-11-22T10:01:00Z", 1)];
		expect(evaluateAggregate({ ...base, checkRuns: nullStart }).conclusion).toBe("failure");
	});
});

describe("evaluateAggregate output", () => {
	it("lists failing rows first in the summary and gives one annotation per non-success row", () => {
		const result = evaluateAggregate(
			build(
				[
					["typecheck", GREEN],
					["test:unit", { kind: "run", conclusion: "failure" }],
				],
				[["codecov/patch", { kind: "none" }]],
				"after"
			)
		);
		const lines = result.summary.split("\n");
		expect(lines[4]).toContain("`test:unit`");
		expect(lines[4]).toContain("FAIL: failure");
		expect(result.summary).toContain("[open](https://example.test/");
		expect(result.summary).toContain("| `codecov/patch` | FAIL: never posted | none |");
		expect(result.annotations.map((a) => a.title)).toEqual(["test:unit", "codecov/patch"]);
	});

	it("covers every id and context the cross product uses", () => {
		expect(ID_ITEMS.length).toBeGreaterThan(10);
		expect(STATUS_ITEMS.length).toBeGreaterThan(10);
	});
});
