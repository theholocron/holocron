import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("constructs without an org (the errors capability activates from env vars)", () => {
		expect(() => createPlugin({ cliToken: "sntryu_tok" })).not.toThrow();
	});

	it("returns a plugin with an errors capability factory", () => {
		const plugin = createPlugin({ cliToken: "sntryu_tok", org: "my-org" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-sentry");
		expect(typeof plugin.capabilities.errors).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: "sntryu_tok", org: "my-org" });
		const cap = plugin.capabilities.errors();
		expect(cap.key).toBe("errors");
		expect(cap.providerName).toBe("sentry");
	});
});
