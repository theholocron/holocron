import { describe, expect, it } from "vitest";

import { stubFetch } from "./helpers.js";
import { AUTH_HINT, createPlugin } from "./index.js";

describe("createPlugin", () => {
	it("wires the deployment capability against the given fetch + token", () => {
		const stub = stubFetch([]);
		const plugin = createPlugin({
			cliToken: "test-token",
			fetch: stub.fetch,
		});
		expect(plugin.name).toBe("@theholocron/holocron-plugin-netlify");
		expect(typeof plugin.capabilities.deployment).toBe("function");
	});
});

describe("AUTH_HINT", () => {
	it("mentions the holocron auth set command", () => {
		expect(AUTH_HINT).toMatch(/holocron auth set netlify/);
	});
});
