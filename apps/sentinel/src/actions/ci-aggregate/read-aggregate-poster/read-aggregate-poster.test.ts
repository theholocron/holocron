import { describe, expect, it, vi } from "vitest";

import { AGGREGATE_POSTER_TTL_MS, readAggregatePoster } from "./read-aggregate-poster.js";
import type { ReadAggregatePosterInput } from "./read-aggregate-poster.type.js";

const CLIENT = { git: {} } as ReadAggregatePosterInput["client"];
const valid = (ci?: { aggregate?: string }) => ({
	status: "valid" as const,
	filepath: "holocron.config.ts",
	config: { tasks: [], ...(ci ? { ci } : {}) } as never,
});

describe("readAggregatePoster", () => {
	it("is sentinel when the commit's own config says so, read at that commit", async () => {
		const validateConfig = vi.fn(async () => valid({ aggregate: "sentinel" }));
		const out = await readAggregatePoster({
			client: CLIENT,
			repo: "acme/demo",
			sha: "abc",
			cache: new Map(),
			validateConfig,
		});
		expect(out).toEqual({ poster: "sentinel" });
		expect(validateConfig).toHaveBeenCalledWith({ client: CLIENT, repo: "acme/demo", ref: "abc" });
	});

	it("is actions when the config says actions, says nothing, or says something else", async () => {
		for (const config of [valid({ aggregate: "actions" }), valid(), valid({ aggregate: "Sentinel" })]) {
			const out = await readAggregatePoster({
				client: CLIENT,
				repo: "acme/demo",
				sha: "abc",
				cache: new Map(),
				validateConfig: async () => config,
			});
			expect(out).toEqual({ poster: "actions" });
		}
	});

	it("is actions, with the reason, for a commit with no usable config, so a broken head never posts the real check", async () => {
		const out = await readAggregatePoster({
			client: CLIENT,
			repo: "acme/demo",
			sha: "abc",
			cache: new Map(),
			validateConfig: async () => ({ status: "load-error", filepath: "x", message: "boom" }),
		});
		expect(out).toEqual({ poster: "actions", reason: "acme/demo@abc has no usable holocron config (load-error)" });
	});

	it("reads each commit once while the cache is fresh, and again after it expires", async () => {
		const validateConfig = vi.fn(async () => valid({ aggregate: "sentinel" }));
		const cache = new Map();
		const input = { client: CLIENT, repo: "acme/demo", sha: "abc", cache, validateConfig };
		await readAggregatePoster({ ...input, now: 1000 });
		await readAggregatePoster({ ...input, now: 1000 + AGGREGATE_POSTER_TTL_MS - 1 });
		expect(validateConfig).toHaveBeenCalledTimes(1);
		await readAggregatePoster({ ...input, now: 1000 + AGGREGATE_POSTER_TTL_MS });
		expect(validateConfig).toHaveBeenCalledTimes(2);
		await readAggregatePoster({ ...input, sha: "def", now: 1000 });
		expect(validateConfig).toHaveBeenCalledTimes(3);
	});

	it("uses the process cache and the clock when given neither", async () => {
		const validateConfig = vi.fn(async () => valid());
		const input = { client: CLIENT, repo: "acme/process-cache", sha: "abc", validateConfig };
		await readAggregatePoster(input);
		await readAggregatePoster(input);
		expect(validateConfig).toHaveBeenCalledTimes(1);
	});
});
