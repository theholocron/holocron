import { describe, expect, it } from "vitest";

import { createContext, createPlugin, dns } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

describe("createPlugin", () => {
	it("does not resolve the token at load — defers the error to the first authenticated call", async () => {
		const plugin = createPlugin({ env: {}, keyring: () => null });
		expect(typeof plugin.capabilities.dns).toBe("function");
		await expect(plugin.capabilities.dns().listRecords("example.com")).rejects.toThrow(/token/i);
	});

	it("returns a plugin with a dns capability factory", () => {
		const plugin = createPlugin({ cliToken: "cf-tok" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-cloudflare");
		expect(typeof plugin.capabilities.dns).toBe("function");
	});

	it("exposes deployment capability when accountId is provided in options", () => {
		const plugin = createPlugin({ cliToken: "cf-tok", accountId: "acc-123" });
		expect(typeof plugin.capabilities.deployment).toBe("function");
	});

	it("exposes deployment capability when CLOUDFLARE_ACCOUNT_ID env var is set", () => {
		const original = process.env.CLOUDFLARE_ACCOUNT_ID;
		process.env.CLOUDFLARE_ACCOUNT_ID = "acc-from-env";
		try {
			const plugin = createPlugin({ cliToken: "cf-tok" });
			expect(typeof plugin.capabilities.deployment).toBe("function");
		} finally {
			if (original === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
			else process.env.CLOUDFLARE_ACCOUNT_ID = original;
		}
	});

	it("does not expose deployment capability when accountId is absent and env var is unset", () => {
		const original = process.env.CLOUDFLARE_ACCOUNT_ID;
		delete process.env.CLOUDFLARE_ACCOUNT_ID;
		try {
			const plugin = createPlugin({ cliToken: "cf-tok" });
			expect(plugin.capabilities.deployment).toBeUndefined();
		} finally {
			if (original !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = original;
		}
	});
});

describe("dns()", () => {
	it("instantiates CloudflareDns bound to the context's client thunk", () => {
		const { fetch } = stubFetch([cfOk([])]);
		const cap = dns(createContext({ cliToken: "cf-tok", fetch }));
		expect(cap.key).toBe("dns");
		expect(cap.providerName).toBe("cloudflare");
	});
});
