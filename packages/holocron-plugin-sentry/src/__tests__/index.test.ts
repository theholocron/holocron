import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("throws when org is missing", () => {
		expect(() => createPlugin({ token: "tok", org: "" })).toThrow();
	});

	it("returns a plugin with an observability capability factory", () => {
		const plugin = createPlugin({ token: "sntryu_tok", org: "my-org" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-sentry");
		expect(typeof plugin.capabilities.observability).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ token: "sntryu_tok", org: "my-org" });
		const cap = plugin.capabilities.observability();
		expect(cap.key).toBe("observability");
		expect(cap.providerName).toBe("sentry");
	});
});
