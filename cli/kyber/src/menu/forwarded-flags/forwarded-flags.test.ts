import { describe, expect, it } from "vitest";

import { forwardedFlags } from "./forwarded-flags.js";

describe("forwardedFlags", () => {
	it("forwards repeated --token entries", () => {
		expect(forwardedFlags({ token: ["github=x", "vercel=y"] })).toEqual([
			"--token",
			"github=x",
			"--token",
			"vercel=y",
		]);
	});

	it("forwards --org, --cwd, and --dry-run when present", () => {
		expect(forwardedFlags({ org: "theholocron", cwd: "/repo", dryRun: true })).toEqual([
			"--org",
			"theholocron",
			"--cwd",
			"/repo",
			"--dry-run",
		]);
	});

	it("omits flags that are absent or false", () => {
		expect(forwardedFlags({ dryRun: false })).toEqual([]);
		expect(forwardedFlags({})).toEqual([]);
	});

	it("dryRunOverride wins over argv.dryRun in both directions", () => {
		expect(forwardedFlags({ dryRun: false }, true)).toEqual(["--dry-run"]);
		expect(forwardedFlags({ dryRun: true }, false)).toEqual([]);
	});

	it("falls back to argv.dryRun when no override is passed", () => {
		expect(forwardedFlags({ dryRun: true })).toEqual(["--dry-run"]);
	});
});
