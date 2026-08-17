import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";

describe("createPlugin", () => {
	it("returns a plugin with a notifications capability factory", () => {
		const plugin = createPlugin({ cliToken: WEBHOOK });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-discord");
		expect(typeof plugin.capabilities.notifications).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: WEBHOOK });
		const cap = plugin.capabilities.notifications();
		expect(cap.key).toBe("notifications");
		expect(cap.providerName).toBe("discord");
	});
});
