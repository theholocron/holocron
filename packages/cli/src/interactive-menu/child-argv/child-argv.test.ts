import { describe, expect, it } from "vitest";

import { buildChildArgv, forwardedFlags } from "../child-argv/index.js";
import { getEntry } from "../command-registry/index.js";

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

describe("buildChildArgv", () => {
	it("splits a multi-word command name into tokens", () => {
		expect(buildChildArgv(getEntry("auth set"), ["github"], {})).toEqual(["auth", "set", "github"]);
	});

	it("appends resolved positionals then forwarded flags, in order", () => {
		expect(buildChildArgv(getEntry("deploy"), ["main"], { dryRun: true, org: "theholocron" })).toEqual([
			"deploy",
			"main",
			"--org",
			"theholocron",
			"--dry-run",
		]);
	});

	it("handles a command with no positionals", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {})).toEqual(["doctor"]);
	});

	it("passes a dryRunOverride through to forwardedFlags", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {}, true)).toEqual(["doctor", "--dry-run"]);
		expect(buildChildArgv(getEntry("doctor"), [], { dryRun: true }, false)).toEqual(["doctor"]);
	});
});
