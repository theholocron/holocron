import { describe, expect, it } from "vitest";

import { run as leaf } from "../evaluate-aggregate/evaluate-aggregate.fixtures.js";
import { FakeAggregateApi } from "./post-aggregate.fake.js";
import { postAggregate } from "./post-aggregate.js";
import { AGGREGATE_CHECK_NAME, AGGREGATE_TIMEOUT_MS } from "./post-aggregate.type.js";

const NOW = Date.parse("2026-11-22T10:30:00Z");
const T = (minute: number) => new Date(Date.parse("2026-11-22T10:00:00Z") + minute * 60_000).toISOString();

function setup(leaves: Array<[string, string | null]>) {
	const api = new FakeAggregateApi();
	api.runs = leaves.map(([name, conclusion], i) => leaf(name, conclusion, T(1), i + 1));
	const input = { api, sha: "abc", expected: ["typecheck", "test:unit"], statuses: [], now: NOW };
	return { api, input };
}

const green = (): Array<[string, string | null]> => [
	["typecheck / Conclusion", "success"],
	["test:unit / Conclusion", "success"],
];

describe("postAggregate", () => {
	it("creates a completed success run when none exists and everything passed", async () => {
		const { api, input } = setup(green());
		const out = await postAggregate(input);
		expect(out.action).toBe("created");
		expect(out.result.conclusion).toBe("success");
		expect(out.stale).toBe(true);
		expect(api.writes[0]?.write).toMatchObject({
			status: "completed",
			conclusion: "success",
			title: "All required checks passed",
		});
		expect(api.runs.find((r) => r.name === AGGREGATE_CHECK_NAME)?.id).toBe(out.runId);
	});

	it("creates an in-progress run while a check is still running, and a failure title for a red one", async () => {
		const pending = setup([
			["typecheck / Conclusion", "success"],
			["test:unit / Conclusion", null],
		]);
		const a = await postAggregate({ ...pending.input, now: NOW - 25 * 60_000 });
		expect(a.result.conclusion).toBe("pending");
		expect(pending.api.writes[0]?.write).toMatchObject({
			status: "in_progress",
			title: "Waiting for required checks",
		});
		expect(pending.api.writes[0]?.write.conclusion).toBeUndefined();
		const red = setup([
			["typecheck / Conclusion", "failure"],
			["test:unit / Conclusion", "success"],
		]);
		await postAggregate(red.input);
		expect(red.api.writes[0]?.write).toMatchObject({ conclusion: "failure", title: "Required checks failed" });
		expect(red.api.writes[0]?.write.text).toContain("typecheck: failure");
	});

	it("leaves a run alone that already says the verdict, unless the output is to be refreshed", async () => {
		const { api, input } = setup(green());
		await postAggregate(input);
		const before = api.writes.length;
		const again = await postAggregate(input);
		expect(again.action).toBe("unchanged");
		expect(again.stale).toBe(false);
		expect(api.writes.length).toBe(before);
		const refreshed = await postAggregate({ ...input, refreshOutput: true });
		expect(refreshed.action).toBe("updated");
	});

	it("updates a stale in-progress run to the verdict, and calls it stale only past the grace", async () => {
		const { api, input } = setup(green());
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(1),
			url: null,
		});
		const out = await postAggregate({ ...input, now: NOW });
		expect(out.action).toBe("updated");
		expect(out.stale).toBe(true);
		expect(out.runId).toBe(50);
		const young = setup(green());
		young.api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(28),
			url: null,
		});
		const quick = await postAggregate(young.input);
		expect(quick.action).toBe("updated");
		expect(quick.stale).toBe(false);
	});

	it("reports a completed run that disagrees with the verdict as stale", async () => {
		const { api, input } = setup([
			["typecheck / Conclusion", "failure"],
			["test:unit / Conclusion", "success"],
		]);
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "completed",
			conclusion: "success",
			startedAt: T(1),
			url: null,
		});
		const out = await postAggregate(input);
		expect(out.action).toBe("updated");
		expect(out.stale).toBe(true);
		expect(api.runs.find((r) => r.id === 50)?.conclusion).toBe("failure");
	});

	it("never waits for itself: a `ci` id in expected is dropped and its own run is not an input", async () => {
		const { api, input } = setup(green());
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(1),
			url: null,
		});
		const out = await postAggregate({ ...input, expected: [...input.expected, "ci"] });
		expect(out.result.conclusion).toBe("success");
	});

	it("dry run reads and decides but writes nothing", async () => {
		const { api, input } = setup(green());
		expect((await postAggregate({ ...input, dryRun: true })).action).toBe("would-create");
		expect(api.writes).toEqual([]);
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(1),
			url: null,
		});
		const out = await postAggregate({ ...input, dryRun: true });
		expect(out).toMatchObject({ action: "would-update", runId: 50 });
		expect(api.writes).toEqual([]);
	});

	it("keeps the oldest run when two deliveries both created one, and completes the other as neutral", async () => {
		const { api, input } = setup(green());
		api.raceOnCreate = [
			{ id: 99, name: AGGREGATE_CHECK_NAME, status: "in_progress", conclusion: null, startedAt: T(0), url: null },
		];
		const out = await postAggregate(input);
		expect(out.runId).toBe(99);
		expect(out.closed).toEqual([100]);
		// Two runs that started together are ordered by id.
		const tie = setup(green());
		tie.api.raceOnCreate = [
			{
				id: 99,
				name: AGGREGATE_CHECK_NAME,
				status: "in_progress",
				conclusion: null,
				startedAt: new Date(NOW).toISOString(),
				url: null,
			},
		];
		expect((await postAggregate(tie.input)).runId).toBe(99);
		expect(api.runs.find((r) => r.id === 100)).toMatchObject({ status: "completed", conclusion: "neutral" });
	});

	it("orders racing runs with no start time by id", async () => {
		const { api, input } = setup(green());
		api.raceOnCreate = [
			{ id: 97, name: AGGREGATE_CHECK_NAME, status: "in_progress", conclusion: null, startedAt: null, url: null },
			{ id: 96, name: AGGREGATE_CHECK_NAME, status: "in_progress", conclusion: null, startedAt: null, url: null },
		];
		expect((await postAggregate(input)).runId).toBe(96);
	});

	it("skips a duplicate that is already completed or has no id when converging", async () => {
		const { api, input } = setup(green());
		api.raceOnCreate = [
			{
				id: null,
				name: AGGREGATE_CHECK_NAME,
				status: "in_progress",
				conclusion: null,
				startedAt: null,
				url: null,
			},
			{
				id: 98,
				name: AGGREGATE_CHECK_NAME,
				status: "completed",
				conclusion: "neutral",
				startedAt: T(0),
				url: null,
			},
		];
		const out = await postAggregate(input);
		expect(out.closed).toEqual([]);
	});

	it("falls back to a new run when the provider refuses to reopen a completed one", async () => {
		const { api, input } = setup([
			["typecheck / Conclusion", "success"],
			["test:unit / Conclusion", null],
		]);
		api.refuseReopen = true;
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "completed",
			conclusion: "success",
			startedAt: T(1),
			url: null,
		});
		const out = await postAggregate({ ...input, now: NOW - 25 * 60_000 });
		expect(out.action).toBe("recreated");
		expect(out.runId).not.toBe(50);
	});

	it("rethrows a refused update that reopening does not explain", async () => {
		const { api, input } = setup(green());
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(1),
			url: null,
		});
		api.updateCheckRun = async () => {
			throw new Error("boom");
		};
		await expect(postAggregate(input)).rejects.toThrow("boom");
	});

	it("writes again once when the state moved under the first write", async () => {
		const { api, input } = setup([
			["typecheck / Conclusion", "success"],
			["test:unit / Conclusion", null],
		]);
		api.onList = (reads) => {
			// After the write, the last check finishes: the verdict changes between the two reads.
			if (reads === 3) api.runs[1] = leaf("test:unit / Conclusion", "success", T(1), 2);
		};
		const out = await postAggregate({ ...input, now: NOW - 25 * 60_000 });
		expect(out.rewritten).toBe(true);
		expect(out.result.conclusion).toBe("success");
		expect(api.runs.find((r) => r.name === AGGREGATE_CHECK_NAME)).toMatchObject({
			status: "completed",
			conclusion: "success",
		});
	});

	it("uses the earliest start of its own runs as the deadline start, so the timeout counts from the first post", async () => {
		const { api, input } = setup([
			["typecheck / Conclusion", "success"],
			["test:unit / Conclusion", null],
		]);
		api.runs.push({
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "in_progress",
			conclusion: null,
			startedAt: T(0),
			url: null,
		});
		const out = await postAggregate({ ...input, now: Date.parse(T(0)) + AGGREGATE_TIMEOUT_MS });
		expect(out.result.conclusion).toBe("failure");
	});

	it("takes the name and the timeout from the input", async () => {
		const { api, input } = setup(green());
		await postAggregate({ ...input, name: "ci / Required checks (sentinel)", timeoutMs: 60_000 });
		expect(api.runs.some((r) => r.name === "ci / Required checks (sentinel)")).toBe(true);
	});

	describe("a check run of the same name that another app posted", () => {
		const actionsRun = {
			id: 50,
			name: AGGREGATE_CHECK_NAME,
			status: "completed",
			conclusion: "success",
			startedAt: T(1),
			url: null,
			appSlug: "github-actions",
		};

		it("is left alone, and nothing is posted when none of ours is there: a commit has one poster", async () => {
			const { api, input } = setup(green());
			api.runs.push({ ...actionsRun });
			const out = await postAggregate(input);
			expect(out).toMatchObject({ action: "foreign", runId: null, stale: false, closed: [], rewritten: false });
			expect(api.writes).toEqual([]);
			expect(api.runs.filter((r) => r.name === AGGREGATE_CHECK_NAME)).toHaveLength(1);
		});

		it("does not count as ours: our own run is the one updated, and theirs stays as it was", async () => {
			const { api, input } = setup(green());
			api.runs.push({ ...actionsRun, conclusion: "failure" });
			api.runs.push({
				id: 60,
				name: AGGREGATE_CHECK_NAME,
				status: "in_progress",
				conclusion: null,
				startedAt: T(2),
				url: null,
				appSlug: "sentinel",
			});
			const out = await postAggregate(input);
			expect(out).toMatchObject({ action: "updated", runId: 60 });
			expect(api.runs.find((r) => r.id === 50)?.conclusion).toBe("failure");
		});

		it("reads which apps are foreign from the input, and a run with no slug is ours", async () => {
			const { api, input } = setup(green());
			api.runs.push({ ...actionsRun, appSlug: "other-app" });
			expect((await postAggregate({ ...input, foreignAppSlugs: ["other-app"] })).action).toBe("foreign");
			expect((await postAggregate({ ...input, foreignAppSlugs: [] })).action).toBe("unchanged");
			const bare = setup(green());
			bare.api.runs.push({ ...actionsRun, appSlug: null });
			expect((await postAggregate(bare.input)).action).toBe("unchanged");
		});
	});
});
