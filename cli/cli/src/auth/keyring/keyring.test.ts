import { describe, expect, it, vi } from "vitest";

const keyring = vi.hoisted(() => ({
	get: vi.fn((): string | null => "token"),
	set: vi.fn(() => true),
	delete: vi.fn(() => true),
	list: vi.fn(() => ["doppler"]),
	isAvailable: vi.fn(() => true),
	clearCache: vi.fn(),
}));
// Recorded as the module loads, because the mocks are cleared before each test.
const made = vi.hoisted(() => [] as unknown[]);
vi.mock("@napi-rs/keyring", () => ({ Entry: class Entry {}, findCredentials: () => [] }));
vi.mock("@theholocron/kyber/secrets", () => ({
	createKeyring: (options: unknown) => {
		made.push(options);
		return keyring;
	},
}));

import { Entry, findCredentials } from "@napi-rs/keyring";

import {
	clearTokenCache,
	deleteToken,
	getToken,
	isKeyringAvailable,
	listStoredProviders,
	setToken,
} from "./keyring.js";

describe("the CLI's keyring", () => {
	it("stores every token under the holocron service, through the keyring binding it depends on", () => {
		expect(made).toEqual([{ service: "com.theholocron.cli", binding: { Entry, findCredentials } }]);
	});

	it("hands each call to the keyring it made", () => {
		expect(getToken("doppler")).toBe("token");
		expect(keyring.get).toHaveBeenCalledWith("doppler");
		expect(setToken("doppler", "abc")).toBe(true);
		expect(keyring.set).toHaveBeenCalledWith("doppler", "abc");
		expect(deleteToken("doppler")).toBe(true);
		expect(keyring.delete).toHaveBeenCalledWith("doppler");
		expect(listStoredProviders()).toEqual(["doppler"]);
		expect(isKeyringAvailable()).toBe(true);
		clearTokenCache();
		expect(keyring.clearCache).toHaveBeenCalledTimes(1);
	});
});
