import { homedir } from "node:os";
import { join } from "node:path";

import { checkForUpdates as checkPackageForUpdates } from "@theholocron/kyber/notifier";
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkForUpdates } from "./update-notifier.js";

vi.mock("@theholocron/kyber/notifier", () => ({ checkForUpdates: vi.fn(async () => null) }));

describe("checkForUpdates", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.mocked(checkPackageForUpdates).mockClear();
	});

	it("looks up @theholocron/cli and keeps the answer in HOLOCRON_CACHE_DIR", async () => {
		vi.stubEnv("HOLOCRON_CACHE_DIR", "/tmp/holocron-cache");
		expect(await checkForUpdates("1.2.3")).toBeNull();
		expect(checkPackageForUpdates).toHaveBeenCalledWith(
			expect.objectContaining({ name: "@theholocron/cli", currentVersion: "1.2.3", cacheDir: "/tmp/holocron-cache" })
		);
	});

	it("keeps the answer in ~/.cache/holocron when no directory is set", async () => {
		vi.stubEnv("HOLOCRON_CACHE_DIR", "");
		vi.stubEnv("CI", "");
		await checkForUpdates("1.2.3");
		expect(vi.mocked(checkPackageForUpdates).mock.calls[0]?.[0].cacheDir).toBe(join(homedir(), ".cache", "holocron"));
	});

	it("hands over the switches that turn the notice off", async () => {
		vi.stubEnv("CI", "true");
		vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
		await checkForUpdates("1.2.3");
		expect(vi.mocked(checkPackageForUpdates).mock.calls[0]?.[0].env).toEqual({ CI: "true", NO_UPDATE_NOTIFIER: "1" });
	});
});
