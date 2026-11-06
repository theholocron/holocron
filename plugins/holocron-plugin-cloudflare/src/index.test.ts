import { stubFetch } from "@theholocron/http-client/testing";
import { clearCredentials, setCredentials } from "@theholocron/kyber/secrets";
import { afterEach, describe, expect, it } from "vitest";

import { cfOk } from "./helpers.js";
import { createContext, createPlugin, dns, tunnelsCapability } from "./index.js";

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

	it("exposes deployment capability when CLOUDFLARE_ACCOUNT_ID is in the environment", () => {
		const plugin = createPlugin({ cliToken: "cf-tok", env: { CLOUDFLARE_ACCOUNT_ID: "acc-from-env" } });
		expect(typeof plugin.capabilities.deployment).toBe("function");
	});

	it("does not expose deployment capability when accountId is absent everywhere", () => {
		const plugin = createPlugin({ cliToken: "cf-tok", env: {} });
		expect(plugin.capabilities.deployment).toBeUndefined();
	});
});

describe("createContext account id", () => {
	afterEach(() => clearCredentials());

	it("prefers the option, then the environment, then the credentials providers", () => {
		setCredentials("op", { CLOUDFLARE_ACCOUNT_ID: "acc-store" });
		const env = { CLOUDFLARE_ACCOUNT_ID: "acc-env" };
		expect(createContext({ accountId: "acc-opt", env }).options.accountId).toBe("acc-opt");
		expect(createContext({ env }).options.accountId).toBe("acc-env");
		expect(createContext({ env: {} }).options.accountId).toBe("acc-store");
	});

	it("exposes the capabilities when only a credentials provider holds the account id", () => {
		setCredentials("op", { CLOUDFLARE_ACCOUNT_ID: "acc-store" });
		const plugin = createPlugin({ cliToken: "cf-tok", env: {} });
		expect(typeof plugin.capabilities.deployment).toBe("function");
		expect(typeof plugin.capabilities.tunnels).toBe("function");
	});

	it("is undefined when none of them has it", () => {
		expect(createContext({ env: {} }).options.accountId).toBeUndefined();
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

describe("tunnelsCapability()", () => {
	it("builds the tunnels capability for an account", () => {
		const cap = tunnelsCapability(createContext({ cliToken: "cf-tok", accountId: "acc-1" }));
		expect(cap.key).toBe("tunnels");
		expect(cap.providerName).toBe("cloudflare");
	});

	it("is offered by the plugin only when an account id is known", () => {
		expect(typeof createPlugin({ cliToken: "cf-tok", accountId: "acc-1" }).capabilities.tunnels).toBe("function");
	});

	it("refuses without an account id, saying how to give one", () => {
		expect(() => tunnelsCapability(createContext({ cliToken: "cf-tok", env: {} }))).toThrow(
			/accountId is required for Tunnels/
		);
	});
});
