import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkForUpdates, isUpdateAvailable } from "./update-notifier.js";

// ── isUpdateAvailable ────────────────────────────────────────────────────────

describe("isUpdateAvailable", () => {
	it("returns false when versions are equal", () => {
		expect(isUpdateAvailable("1.0.0", "1.0.0")).toBe(false);
	});

	it("returns false when both prereleases compare equal segment by segment (alpha.1 vs alpha.01)", () => {
		expect(isUpdateAvailable("2.0.0-alpha.1", "2.0.0-alpha.01")).toBe(false);
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
	it("reads a missing release part as 0", () => {
		expect(isUpdateAvailable("1.0", "1.0.1")).toBe(true);
		expect(isUpdateAvailable("1.0.1", "1.0")).toBe(false);
	});

	it("reads a missing prerelease segment as empty, so the shorter one is older", () => {
		expect(isUpdateAvailable("1.0.0-alpha", "1.0.0-alpha.1")).toBe(true);
		expect(isUpdateAvailable("1.0.0-alpha.1", "1.0.0-alpha")).toBe(false);
	});

	it("compares prerelease names that are not numbers as text", () => {
		expect(isUpdateAvailable("1.0.0-alpha.1", "1.0.0-beta.1")).toBe(true);
		expect(isUpdateAvailable("1.0.0-beta.1", "1.0.0-alpha.1")).toBe(false);
	});
});

// ── checkForUpdates ──────────────────────────────────────────────────────────

describe("checkForUpdates", () => {
	let cacheDir: string;
	const check = (currentVersion: string, extra: Partial<Parameters<typeof checkForUpdates>[0]> = {}) =>
		checkForUpdates({ name: "@scope/tool", currentVersion, cacheDir, env: {}, ...extra });
	const answer = (tags: Record<string, string>) =>
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ "dist-tags": tags }), { status: 200 }));

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "kyber-notifier-"));
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true });
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("returns null in CI environment", async () => {
		expect(await check("1.0.0", { env: { CI: "true" } })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns null when NO_UPDATE_NOTIFIER is set", async () => {
		expect(await check("1.0.0", { env: { NO_UPDATE_NOTIFIER: "1" } })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("reads process.env when no env is given", async () => {
		vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
		expect(await checkForUpdates({ name: "@scope/tool", currentVersion: "1.0.0", cacheDir })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
		vi.unstubAllEnvs();
	});

	it("returns null when fetch fails", async () => {
		vi.mocked(fetch).mockRejectedValue(new Error("network error"));
		expect(await check("1.0.0")).toBeNull();
	});

	it("returns null when registry returns non-ok status", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
		expect(await check("1.0.0")).toBeNull();
	});

	it("returns null when already on the latest version", async () => {
		answer({ latest: "1.0.0" });
		expect(await check("1.0.0")).toBeNull();
	});

	it("returns null when the registry names no version for the channel or for latest", async () => {
		answer({});
		expect(await check("1.0.0")).toBeNull();
	});

	it("looks up the package it is given", async () => {
		answer({ latest: "2.0.0" });
		await check("1.0.0");
		expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://registry.npmjs.org/%40scope%2Ftool");
	});

	it("returns a print function when an update is available", async () => {
		answer({ latest: "2.0.0" });
		expect(await check("1.0.0")).toBeTypeOf("function");
	});

	it("uses the alpha dist-tag for prerelease versions", async () => {
		answer({ alpha: "2.0.0-alpha.74", latest: "1.0.0" });
		expect(await check("2.0.0-alpha.73")).toBeTypeOf("function");
	});

	it("falls back to latest when the channel has no tag", async () => {
		answer({ latest: "3.0.0" });
		expect(await check("2.0.0-beta.1")).toBeTypeOf("function");
	});

	it("asks the registry once a day: the second run reads the cache", async () => {
		answer({ latest: "2.0.0" });
		await check("1.0.0");
		await check("1.0.0");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("still answers when the cache cannot be written", async () => {
		answer({ latest: "2.0.0" });
		writeFileSync(join(cacheDir, "blocker"), "");
		expect(await check("1.0.0", { cacheDir: join(cacheDir, "blocker", "sub") })).toBeTypeOf("function");
	});

	it("print function writes the versions and the install command to stderr", async () => {
		answer({ latest: "2.0.0" });
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const notify = await check("1.0.0");
		notify?.();
		const output = stderrWrite.mock.calls[0]?.[0] as string;
		expect(output).toContain("1.0.0");
		expect(output).toContain("2.0.0");
		expect(output).toContain("npm install -g @scope/tool");
	});

	it("uses the install command it is given", async () => {
		answer({ latest: "2.0.0" });
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		(await check("1.0.0", { installCommand: "pnpm add -g @scope/tool" }))?.();
		expect(stderrWrite.mock.calls[0]?.[0] as string).toContain("pnpm add -g @scope/tool");
	});
});
