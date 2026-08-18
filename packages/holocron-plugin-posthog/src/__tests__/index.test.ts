import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("returns a plugin with an analytics capability factory", () => {
		const plugin = createPlugin({ cliToken: "phx_test" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-posthog");
		expect(typeof plugin.capabilities.analytics).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: "phx_test" });
		const cap = plugin.capabilities.analytics();
		expect(cap.key).toBe("analytics");
		expect(cap.providerName).toBe("posthog");
	});
});
