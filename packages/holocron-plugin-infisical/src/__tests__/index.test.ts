import { describe, expect, it } from "vitest";

import { AUTH_HINT, createPlugin } from "../index.js";
import { stubFetch } from "./helpers.js";

describe("createPlugin", () => {
	it("wires the vault capability against the given fetch + token", async () => {
		const stub = stubFetch([{ status: 200, body: { secrets: [{ secretKey: "API_KEY", secretValue: "x" }] } }]);
		const plugin = createPlugin({
			cliToken: "test-token",
			workspace: "ws-1",
			environment: "dev",
			fetch: stub.fetch,
		});
		expect(plugin.name).toBe("@theholocron/holocron-plugin-infisical");
		expect(typeof plugin.capabilities.vault).toBe("function");
		const vault = plugin.capabilities.vault!();
		expect(await vault.list()).toEqual(["API_KEY"]);
	});
});

describe("AUTH_HINT", () => {
	it("mentions the holocron auth set command + Universal Auth guidance", () => {
		expect(AUTH_HINT).toMatch(/holocron auth set infisical/);
		expect(AUTH_HINT).toMatch(/Universal Auth/);
	});
});
