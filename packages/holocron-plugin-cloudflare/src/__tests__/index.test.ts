import { describe, expect, it } from "vitest";

import { createPlugin, dns } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

describe("createPlugin", () => {
	it("throws when no token is resolvable", () => {
		expect(() => createPlugin({})).toThrow();
	});

	it("returns a plugin with a dns capability factory", () => {
		const plugin = createPlugin({ cliToken: "cf-tok" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-cloudflare");
		expect(typeof plugin.capabilities.dns).toBe("function");
	});
});

describe("dns()", () => {
	it("instantiates CloudflareDns bound to the client", () => {
		const { fetch } = stubFetch([cfOk([])]);
		const plugin = createPlugin({ cliToken: "cf-tok", fetch });
		const cap = dns({
			options: { cliToken: "cf-tok", fetch },
			client: plugin.capabilities.dns()["client" as never] as never,
		});
		expect(cap.key).toBe("dns");
		expect(cap.providerName).toBe("cloudflare");
	});
});
