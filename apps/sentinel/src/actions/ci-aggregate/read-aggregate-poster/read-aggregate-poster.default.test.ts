import { describe, expect, it, vi } from "vitest";

const validateConfig = vi.hoisted(() => vi.fn());
vi.mock("../../../utils/validate-config/index.js", () => ({ validateConfig }));

import { readAggregatePoster } from "./read-aggregate-poster.js";

describe("readAggregatePoster with the default config reader", () => {
	it("reads the config through validateConfig at the head commit", async () => {
		validateConfig.mockResolvedValue({
			status: "valid",
			filepath: "holocron.config.ts",
			config: { tasks: [], ci: { aggregate: "sentinel" } },
		});
		const client = { git: {} } as never;
		const out = await readAggregatePoster({ client, repo: "acme/default-reader", sha: "abc", cache: new Map() });
		expect(out).toEqual({ poster: "sentinel" });
		expect(validateConfig).toHaveBeenCalledWith({ client, repo: "acme/default-reader", ref: "abc" });
	});
});
