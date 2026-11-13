import { describe, expect, it, vi } from "vitest";

import { defaultProviderTokens } from "./default-provider-tokens.js";

const listed = [{ envName: "HOLOCRON_CLOUDFLARE_TOKEN", keyringKey: "cloudflare" }];

describe("defaultProviderTokens", () => {
	it("imports the provider's plugin package and returns the tokens it lists", async () => {
		const importer = vi.fn(async () => ({ tokens: listed }));
		const tokens = await defaultProviderTokens({ filepath: "/repo/holocron.config.ts" }, importer)("cloudflare");
		expect(tokens).toBe(listed);
		expect(importer).toHaveBeenCalledWith("@theholocron/holocron-plugin-cloudflare");
	});

	it("is empty for a plugin that lists none", async () => {
		const tokens = await defaultProviderTokens({ filepath: "/repo/holocron.config.ts" }, async () => ({}))("demo");
		expect(tokens).toEqual([]);
	});
});
