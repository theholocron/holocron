import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AuthError, createPlugin, TurboCache } from "./index.js";

describe("createPlugin", () => {
	it("wires the cache capability", () => {
		const plugin = createPlugin({ cliToken: "v-tok", env: {} });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-turbo");
		const cap = plugin.capabilities.cache();
		expect(cap).toBeInstanceOf(TurboCache);
		expect(cap.key).toBe("cache");
		expect(cap.providerName).toBe("turbo");
	});

	it("defers the missing-token AuthError to the first call", async () => {
		const cache = createPlugin({ env: { HOLOCRON_TURBO_TEAM: "acme" }, keyring: () => null }).capabilities.cache();
		await expect(cache.checkToken()).rejects.toBeInstanceOf(AuthError);
	});

	it("takes the team from HOLOCRON_TURBO_TEAM, then TURBO_TEAM, and the option wins", async () => {
		const urls: string[] = [];
		const run = async (opts: Record<string, unknown>) => {
			const { fetch, calls } = stubFetch([{ body: { status: "enabled" } }]);
			await createPlugin({ cliToken: "v-tok", fetch, ...opts } as never)
				.capabilities.cache()
				.checkToken();
			urls.push(calls[0]!.url);
		};
		await run({ env: { HOLOCRON_TURBO_TEAM: "a", TURBO_TEAM: "b" } });
		await run({ env: { TURBO_TEAM: "b" } });
		await run({ env: { TURBO_TEAM: "b" }, team: "c" });
		expect(urls.map((u) => new URL(u).searchParams.get("slug"))).toEqual(["a", "b", "c"]);
	});

	it("passes baseUrl through", async () => {
		const { fetch, calls } = stubFetch([{ body: { status: "enabled" } }]);
		await createPlugin({ cliToken: "v", team: "acme", baseUrl: "https://t.test.invalid", fetch })
			.capabilities.cache()
			.checkToken();
		expect(calls[0]?.url).toContain("https://t.test.invalid");
	});
});
