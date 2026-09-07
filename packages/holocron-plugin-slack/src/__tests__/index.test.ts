import { describe, expect, it } from "vitest";

import { createContext, createPlugin } from "../index.js";

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

describe("createContext — lazy client", () => {
	it("does not resolve the token at construction (no token → no throw)", () => {
		expect(() => createContext({})).not.toThrow();
	});

	it("memoizes the client across calls", () => {
		const ctx = createContext({ cliToken: "xoxb-test", baseUrl: "https://slack.test/api" });
		expect(ctx.client()).toBe(ctx.client());
	});
});
