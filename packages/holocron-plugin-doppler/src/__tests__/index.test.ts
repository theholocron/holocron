import { describe, expect, it } from "vitest";

import { AUTH_HINT, createPlugin } from "../index.js";
import { stubFetch } from "./helpers.js";

describe("createPlugin", () => {
	it("wires the vault capability against the given fetch + token", async () => {
		const stub = stubFetch([{ status: 200, body: { secrets: { API_KEY: { raw: "x", computed: "x" } } } }]);
		const plugin = createPlugin({
			cliToken: "dp.pt.abc",
			project: "demo",
			config: "dev",
			fetch: stub.fetch,
		});
		expect(plugin.name).toBe("@theholocron/holocron-plugin-doppler");
		expect(typeof plugin.capabilities.vault).toBe("function");
		const vault = plugin.capabilities.vault!();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vault type is opaque `unknown`
		const keys = await (vault as any).list();
		expect(keys).toEqual(["API_KEY"]);
	});

	it("uses HOLOCRON_DOPPLER_TOKEN when cliToken is absent", () => {
		const stub = stubFetch([]);
		const plugin = createPlugin({
			env: { HOLOCRON_DOPPLER_TOKEN: "env-token" },
			project: "demo",
			config: "dev",
			fetch: stub.fetch,
		});
		expect(plugin).toBeTruthy();
	});
});

describe("AUTH_HINT", () => {
	it("mentions the Doppler CLI bootstrap sequence", () => {
		expect(AUTH_HINT).toMatch(/brew install/);
		expect(AUTH_HINT).toMatch(/doppler login/);
		expect(AUTH_HINT).toMatch(/holocron auth set doppler/);
	});
});
