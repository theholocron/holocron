import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AUTH_HINT, createPlugin } from "./index.js";

describe("createPlugin", () => {
	it("wires the monitoring capability against the given fetch + token", () => {
		const stub = stubFetch([]);
		const plugin = createPlugin({
			cliToken: "test-token",
			accountId: "acct-1",
			fetch: stub.fetch,
		});
		expect(plugin.name).toBe("@theholocron/holocron-plugin-checkly");
		expect(typeof plugin.capabilities.monitoring).toBe("function");
	});
});

describe("AUTH_HINT", () => {
	it("mentions the holocron auth set command", () => {
		expect(AUTH_HINT).toMatch(/holocron auth set checkly/);
	});
});
