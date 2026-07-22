import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkForUpdates, isUpdateAvailable } from "../update-notifier.js";

// ── isUpdateAvailable ────────────────────────────────────────────────────────

describe("isUpdateAvailable", () => {
	it("returns false when versions are equal", () => {
		expect(isUpdateAvailable("1.0.0", "1.0.0")).toBe(false);
	});

	it("returns true when latest patch is higher", () => {
		expect(isUpdateAvailable("1.0.0", "1.0.1")).toBe(true);
	});

	it("returns false when current patch is higher", () => {
		expect(isUpdateAvailable("1.0.2", "1.0.1")).toBe(false);
	});

	it("returns true when latest minor is higher", () => {
		expect(isUpdateAvailable("1.0.0", "1.1.0")).toBe(true);
	});

	it("returns true when latest major is higher", () => {
		expect(isUpdateAvailable("1.0.0", "2.0.0")).toBe(true);
	});

	it("returns true when stable is available and current is prerelease", () => {
		expect(isUpdateAvailable("2.0.0-alpha.73", "2.0.0")).toBe(true);
	});

	it("returns false when latest is prerelease and current is stable", () => {
		expect(isUpdateAvailable("2.0.0", "2.0.0-alpha.73")).toBe(false);
	});

	it("returns true when prerelease number is higher", () => {
		expect(isUpdateAvailable("2.0.0-alpha.73", "2.0.0-alpha.74")).toBe(true);
	});

	it("returns false when prerelease number is lower", () => {
		expect(isUpdateAvailable("2.0.0-alpha.74", "2.0.0-alpha.73")).toBe(false);
	});

	it("returns false when prerelease versions are equal", () => {
		expect(isUpdateAvailable("2.0.0-alpha.73", "2.0.0-alpha.73")).toBe(false);
	});

	it("strips leading v prefix", () => {
		expect(isUpdateAvailable("v1.0.0", "v1.0.1")).toBe(true);
	});
});

// ── checkForUpdates ──────────────────────────────────────────────────────────

describe("checkForUpdates", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		const env = { ...originalEnv, HOLOCRON_CACHE_DIR: `/tmp/holocron-test-${Date.now()}` };
		delete env["CI"];
		delete env["NO_UPDATE_NOTIFIER"];
		process.env = env;
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("returns null in CI environment", async () => {
		process.env["CI"] = "true";
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns null when NO_UPDATE_NOTIFIER is set", async () => {
		process.env["NO_UPDATE_NOTIFIER"] = "1";
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns null when fetch fails", async () => {
		vi.mocked(fetch).mockRejectedValue(new Error("network error"));
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeNull();
	});

	it("returns null when registry returns non-ok status", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeNull();
	});

	it("returns null when already on the latest version", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ "dist-tags": { latest: "1.0.0" } }), { status: 200 })
		);
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeNull();
	});

	it("returns a print function when an update is available", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ "dist-tags": { latest: "2.0.0" } }), { status: 200 })
		);
		const result = await checkForUpdates("1.0.0");
		expect(result).toBeTypeOf("function");
	});

	it("uses the alpha dist-tag for prerelease versions", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ "dist-tags": { alpha: "2.0.0-alpha.74", latest: "1.0.0" } }), { status: 200 })
		);
		const result = await checkForUpdates("2.0.0-alpha.73");
		expect(result).toBeTypeOf("function");
	});

	it("print function writes to stderr", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ "dist-tags": { latest: "2.0.0" } }), { status: 200 })
		);
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const notify = await checkForUpdates("1.0.0");
		notify?.();
		expect(stderrWrite).toHaveBeenCalled();
		const output = stderrWrite.mock.calls[0]?.[0] as string;
		expect(output).toContain("1.0.0");
		expect(output).toContain("2.0.0");
	});
});
