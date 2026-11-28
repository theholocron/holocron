import { describe, expect, it } from "vitest";

import { createPlugin } from "./index.js";

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

describe("the token probe", () => {
	it("is registered, read-only, and takes another token", () => {
		const probe = createPlugin({ cliToken: "sntryu_tok", org: "my-org" }).probes.token;
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
	});

	it("reads with the token it was handed", async () => {
		const calls: string[] = [];
		const fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
			calls.push(`${String(url)} ${new Headers(init?.headers).get("authorization") ?? ""}`);
			return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
		}) as typeof globalThis.fetch;
		for (const args of [[], ["--layer", "dev", "--token-name", "HOLOCRON_SENTRY_TOKEN"]]) {
			const plugin = createPlugin({ cliToken: "sntryu_tok", org: "my-org", fetch });
			await plugin.probes.token.run({
				args,
				dryRun: false,
				say: () => {},
				secret: () => {},
				write: async () => undefined,
				cleanup: () => {},
			});
		}
		expect(calls.some((c) => c.includes("/organizations/my-org/projects/"))).toBe(true);
		expect(calls.some((c) => c.includes("sntryu_tok"))).toBe(true);
	});
});
