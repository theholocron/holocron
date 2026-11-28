import { describe, expect, it, vi } from "vitest";

import { AGGREGATE_CHECKS_TTL_MS, readAggregateChecks } from "./read-aggregate-checks.js";
import type { ReadAggregateChecksInput } from "./read-aggregate-checks.type.js";

const CLIENT = { git: {} } as ReadAggregateChecksInput["client"];
const valid = {
	status: "valid" as const,
	filepath: "holocron.config.ts",
	config: { tasks: [], extraRequiredChecks: ["typecheck / Conclusion", "codecov/patch"] },
};

describe("readAggregateChecks", () => {
	it("derives expected and the status contexts from the config at the base branch", async () => {
		const validateConfig = vi.fn(async () => valid);
		const out = await readAggregateChecks({
			client: CLIENT,
			repo: "acme/demo",
			baseRef: "alpha",
			cache: new Map(),
			validateConfig,
		});
		expect(out).toEqual({ ok: true, expected: ["typecheck"], statuses: ["codecov/patch"] });
		expect(validateConfig).toHaveBeenCalledWith({ client: CLIENT, repo: "acme/demo", ref: "alpha" });
	});

	it("reads each repo and base once while the cache is fresh, and again after it expires", async () => {
		const validateConfig = vi.fn(async () => valid);
		const cache = new Map();
		const input = { client: CLIENT, repo: "acme/demo", baseRef: "alpha", cache, validateConfig };
		await readAggregateChecks({ ...input, now: 1000 });
		await readAggregateChecks({ ...input, now: 1000 + AGGREGATE_CHECKS_TTL_MS - 1 });
		expect(validateConfig).toHaveBeenCalledTimes(1);
		await readAggregateChecks({ ...input, now: 1000 + AGGREGATE_CHECKS_TTL_MS });
		expect(validateConfig).toHaveBeenCalledTimes(2);
		await readAggregateChecks({ ...input, baseRef: "main", now: 1000 });
		expect(validateConfig).toHaveBeenCalledTimes(3);
	});

	it("gives a reason, and caches nothing, for a repo with no usable config", async () => {
		const validateConfig = vi.fn(async () => ({ status: "no-config" as const }));
		const cache = new Map();
		const out = await readAggregateChecks({
			client: CLIENT,
			repo: "acme/demo",
			baseRef: "alpha",
			cache,
			validateConfig,
		});
		expect(out).toEqual({ ok: false, reason: "acme/demo@alpha has no usable holocron config (no-config)" });
		expect(cache.size).toBe(0);
	});

	it("uses the process cache and Date.now when given neither", async () => {
		const validateConfig = vi.fn(async () => valid);
		const input = { client: CLIENT, repo: "acme/process-cache", baseRef: "alpha", validateConfig };
		await readAggregateChecks(input);
		await readAggregateChecks(input);
		expect(validateConfig).toHaveBeenCalledTimes(1);
	});
});
