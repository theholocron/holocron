import { clearCredentials, setCredentials } from "@theholocron/kyber/secrets";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real keyring is never asked: a test that reaches it says what it returns.
const fake = vi.hoisted(() => ({
	get: vi.fn((_account: string): string | null => null),
	set: vi.fn(() => true),
	delete: vi.fn(() => true),
	list: vi.fn(() => ["doppler"]),
	isAvailable: vi.fn(() => true),
	clearCache: vi.fn(),
}));
// Recorded as the module loads, because the mocks are cleared before each test.
const made = vi.hoisted(() => [] as unknown[]);
vi.mock("@napi-rs/keyring", () => ({ Entry: class Entry {}, findCredentials: () => [] }));
vi.mock("@theholocron/kyber/secrets", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/secrets")>()),
	createKeyring: (options: unknown) => {
		made.push(options);
		return fake;
	},
}));

import { Entry, findCredentials } from "@napi-rs/keyring";

import { AuthError, createFeatureResolver, createResolveToken, keyring } from "./auth.js";

afterEach(() => {
	clearCredentials();
	vi.mocked(fake.get).mockReset().mockReturnValue(null);
});

describe("the CLI's keyring", () => {
	it("stores every token under the holocron service, through the keyring binding it depends on", () => {
		expect(made).toEqual([{ service: "com.theholocron.cli", binding: { Entry, findCredentials } }]);
	});

	it("is the keyring it made", () => {
		expect(keyring).toBe(fake);
	});
});

const resolveToken = createResolveToken({
	envName: "HOLOCRON_TEST_TOKEN",
	vendorEnvName: "TEST_TOKEN",
	keyringService: "test",
	errorMessage: "no test token found. Pass --token <TOKEN>, set HOLOCRON_TEST_TOKEN / TEST_TOKEN",
});

describe("createResolveToken", () => {
	it("reads the plugin's variable, then the vendor's, then the keyring", () => {
		expect(resolveToken({ env: { HOLOCRON_TEST_TOKEN: "plugin", TEST_TOKEN: "vendor" } })).toBe("plugin");
		expect(resolveToken({ env: { TEST_TOKEN: "vendor" } })).toBe("vendor");
		vi.mocked(fake.get).mockReturnValueOnce("kr-tok");
		expect(resolveToken({ env: {} })).toBe("kr-tok");
		expect(fake.get).toHaveBeenCalledWith("test");
	});

	it("looks in the keyring entry of the org HOLOCRON_ORG names", () => {
		vi.mocked(fake.get).mockImplementation((account) => (account === "test.acme" ? "org-tok" : null));
		expect(resolveToken({ env: { HOLOCRON_ORG: "acme" } })).toBe("org-tok");
	});

	it("finds a credentials provider's variable before the keyring", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_TOKEN: "stored" });
		expect(resolveToken({ env: {} })).toBe("stored");
		expect(fake.get).not.toHaveBeenCalled();
	});

	it("throws an AuthError with the message it was given", () => {
		expect(() => resolveToken({ env: {} })).toThrow(AuthError);
		expect(() => resolveToken({ env: {} })).toThrow(/HOLOCRON_TEST_TOKEN/);
	});

	it("exposes the plugin and vendor environment variables and the keyring entry it reads", () => {
		expect(resolveToken.token).toEqual({
			envName: "HOLOCRON_TEST_TOKEN",
			vendorEnvName: "TEST_TOKEN",
			keyringKey: "test",
		});
	});
});

describe("createFeatureResolver", () => {
	const resolveFeature = createFeatureResolver({ envName: "HOLOCRON_FEAT_TOKEN", keyringKey: "github.feat" });

	it("reads the feature's variable, then the credentials providers', then the keyring", () => {
		expect(resolveFeature({ env: { HOLOCRON_FEAT_TOKEN: "feat" } })).toBe("feat");
		setCredentials("1password:Holocron", { HOLOCRON_FEAT_TOKEN: "stored" });
		expect(resolveFeature({ env: {} })).toBe("stored");
		clearCredentials();
		vi.mocked(fake.get).mockReturnValueOnce("kr-feature");
		expect(resolveFeature({ env: {} })).toBe("kr-feature");
		expect(fake.get).toHaveBeenLastCalledWith("github.feat");
	});

	it("names the vendor given, GitHub when none is, and holocron auth set", () => {
		const sentry = createFeatureResolver({
			envName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
			keyringKey: "sentry.comlink",
			vendor: "Sentry",
		});
		expect(() => sentry({ env: {} })).toThrow(
			/no Sentry token found.*HOLOCRON_SENTRY_COMLINK_TOKEN.*holocron auth set sentry\.comlink/
		);
		expect(() => resolveFeature({ env: {} })).toThrow(/no GitHub token found/);
	});

	it("exposes the environment variable and keyring entry it reads, without the vendor", () => {
		const resolver = createFeatureResolver({
			envName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
			keyringKey: "sentry.comlink",
			vendor: "Sentry",
		});
		expect(resolver.token).toEqual({ envName: "HOLOCRON_SENTRY_COMLINK_TOKEN", keyringKey: "sentry.comlink" });
		expect(resolver({ cliToken: "t", env: {} })).toBe("t");
	});
});
