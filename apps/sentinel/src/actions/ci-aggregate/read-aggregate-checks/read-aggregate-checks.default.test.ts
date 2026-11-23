import { describe, expect, it, vi } from "vitest";

const validateConfig = vi.hoisted(() => vi.fn());
vi.mock("../../../utils/validate-config/index.js", () => ({ validateConfig }));

import { readAggregateChecks } from "./read-aggregate-checks.js";

describe("readAggregateChecks with the default config reader", () => {
	it("reads the config through validateConfig at the base branch", async () => {
		validateConfig.mockResolvedValue({
			status: "valid",
			filepath: "holocron.config.ts",
			config: { tasks: [], extraRequiredChecks: ["lint:code / Conclusion"] },
		});
		const client = { git: {} } as never;
		const out = await readAggregateChecks({
			client,
			repo: "acme/default-reader",
			baseRef: "alpha",
			cache: new Map(),
		});
		expect(out).toEqual({ ok: true, expected: ["lint:code"], statuses: [] });
		expect(validateConfig).toHaveBeenCalledWith({ client, repo: "acme/default-reader", ref: "alpha" });
	});
});
