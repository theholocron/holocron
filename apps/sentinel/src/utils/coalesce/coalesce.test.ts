import { describe, expect, it } from "vitest";

import { coalesce, COALESCE_MAX_EXTRA_RUNS } from "./coalesce.js";

/** A run that waits until the test lets it finish, so calls can overlap on purpose. */
function gated() {
	const gates: Array<() => void> = [];
	let runs = 0;
	const run = () => {
		runs += 1;
		const n = runs;
		return new Promise<number>((resolve) => gates.push(() => resolve(n)));
	};
	return { run, gates, count: () => runs };
}

describe("coalesce", () => {
	it("runs once for a lone call and forgets the key afterwards", async () => {
		const flights = new Map();
		const g = gated();
		const first = coalesce("k", g.run, flights);
		g.gates[0]!();
		await expect(first).resolves.toBe(1);
		expect(flights.size).toBe(0);
		const second = coalesce("k", g.run, flights);
		g.gates[1]!();
		await expect(second).resolves.toBe(2);
	});

	it("runs a second time, not N more, for calls that arrive while it runs, and answers them all with that last run", async () => {
		const flights = new Map();
		const g = gated();
		const a = coalesce("k", g.run, flights);
		const b = coalesce("k", g.run, flights);
		const c = coalesce("k", g.run, flights);
		expect(g.count()).toBe(1);
		g.gates[0]!();
		await Promise.resolve();
		await Promise.resolve();
		expect(g.count()).toBe(2);
		g.gates[1]!();
		await expect(Promise.all([a, b, c])).resolves.toEqual([2, 2, 2]);
		expect(g.count()).toBe(2);
	});

	it("keeps keys apart", async () => {
		const flights = new Map();
		const g = gated();
		const a = coalesce("one", g.run, flights);
		const b = coalesce("two", g.run, flights);
		expect(g.count()).toBe(2);
		g.gates[0]!();
		g.gates[1]!();
		await Promise.all([a, b]);
	});

	it("stops after the extra runs it allows, even if calls keep arriving", async () => {
		const flights = new Map();
		const g = gated();
		const done = coalesce("k", g.run, flights);
		for (let i = 0; i <= COALESCE_MAX_EXTRA_RUNS; i += 1) {
			coalesce("k", g.run, flights);
			g.gates[i]!();
			await Promise.resolve();
			await Promise.resolve();
		}
		await expect(done).resolves.toBe(COALESCE_MAX_EXTRA_RUNS + 1);
		expect(g.count()).toBe(COALESCE_MAX_EXTRA_RUNS + 1);
		expect(flights.size).toBe(0);
	});

	it("forgets the key when the run throws, and passes the error to every waiter", async () => {
		const flights = new Map();
		const boom = () => Promise.reject(new Error("boom"));
		const a = coalesce("k", boom, flights);
		const b = coalesce("k", boom, flights);
		await expect(a).rejects.toThrow("boom");
		await expect(b).rejects.toThrow("boom");
		expect(flights.size).toBe(0);
	});
});
