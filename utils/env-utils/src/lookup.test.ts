import { describe, expect, it, vi } from "vitest";

describe("@theholocron/env-utils/lookup", () => {
	it("exports the lookup helpers", async () => {
		const lookup = await import("./lookup.js");
		expect(Object.keys(lookup).sort()).toEqual(["createEnvLookup", "firstEnv", "withEnvPrefix"]);
	});

	it("does not load dotenv when imported", async () => {
		let loaded = false;
		vi.resetModules();
		vi.doMock("dotenv/config", () => {
			loaded = true;
			return {};
		});
		await import("./lookup.js");
		expect(loaded).toBe(false);
		vi.doUnmock("dotenv/config");
	});
});
