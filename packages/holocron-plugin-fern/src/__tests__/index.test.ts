import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("returns a plugin with a wiki capability factory", () => {
		const plugin = createPlugin();
		expect(plugin.name).toBe("@theholocron/holocron-plugin-fern");
		expect(typeof plugin.capabilities.wiki).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin();
		const cap = plugin.capabilities.wiki();
		expect(cap.key).toBe("wiki");
		expect(cap.providerName).toBe("fern");
	});
});
