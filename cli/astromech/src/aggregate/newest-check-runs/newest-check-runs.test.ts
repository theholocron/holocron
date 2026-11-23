import { describe, expect, it } from "vitest";

import { run } from "../evaluate-aggregate/evaluate-aggregate.fixtures.js";
import { newestCheckRuns } from "./newest-check-runs.js";

describe("newestCheckRuns", () => {
	it("keeps the run with the latest start and orders the result by name", () => {
		const kept = newestCheckRuns([
			run("b / x", "failure", "2026-11-22T10:01:00Z", 1),
			run("a / x", "success", "2026-11-22T10:01:00Z", 2),
			run("b / x", "success", "2026-11-22T10:02:00Z", 3),
		]);
		expect(kept.map((r) => `${r.name}:${r.id}`)).toEqual(["a / x:2", "b / x:3"]);
	});

	it("lets a run with a start beat one without", () => {
		const kept = newestCheckRuns([
			run("a / x", "failure", null, 9),
			run("a / x", "success", "2026-11-22T10:01:00Z", 1),
		]);
		expect(kept[0]?.id).toBe(1);
	});

	it("breaks a tie on start by the higher id, the later one winning an equal id", () => {
		const t = "2026-11-22T10:01:00Z";
		expect(newestCheckRuns([run("a / x", "failure", t, 5), run("a / x", "success", t, 2)])[0]?.id).toBe(5);
		expect(newestCheckRuns([run("a / x", "failure", t, 2), run("a / x", "success", t, 5)])[0]?.id).toBe(5);
		expect(newestCheckRuns([run("a / x", "failure", t, 3), run("a / x", "success", t, 3)])[0]?.conclusion).toBe(
			"success"
		);
	});

	it("treats a missing id as 0", () => {
		const t = "2026-11-22T10:01:00Z";
		const noId = { ...run("a / x", "failure", t, 1), id: null };
		expect(newestCheckRuns([noId, run("a / x", "success", t, 1)])[0]?.conclusion).toBe("success");
		expect(newestCheckRuns([run("a / x", "success", t, 1), noId])[0]?.conclusion).toBe("success");
	});
});
