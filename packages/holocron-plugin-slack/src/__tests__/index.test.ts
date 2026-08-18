import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("returns a plugin with a notifications capability factory", () => {
		const plugin = createPlugin({ cliToken: "xoxb-test" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-slack");
		expect(typeof plugin.capabilities.notifications).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: "xoxb-test" });
		const cap = plugin.capabilities.notifications();
		expect(cap.key).toBe("notifications");
		expect(cap.providerName).toBe("slack");
	});
});
