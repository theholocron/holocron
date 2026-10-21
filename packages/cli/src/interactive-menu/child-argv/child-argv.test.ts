import { describe, expect, it } from "vitest";

import { buildChildArgv, forwardedFlags, secretEnv } from "../child-argv/index.js";
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
		expect(buildChildArgv(getEntry("auth set"), ["github"], {}, {})).toEqual(["auth", "set", "github"]);
	});

	it("appends resolved positionals, options, then forwarded flags, in order", () => {
		expect(buildChildArgv(getEntry("deploy"), ["main"], {}, { dryRun: true, org: "theholocron" })).toEqual([
			"deploy",
			"main",
			"--org",
			"theholocron",
			"--dry-run",
		]);
	});

	it("handles a command with no positionals", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {}, {})).toEqual(["doctor"]);
	});

	it("passes a dryRunOverride through to forwardedFlags", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {}, {}, true)).toEqual(["doctor", "--dry-run"]);
		expect(buildChildArgv(getEntry("doctor"), [], {}, { dryRun: true }, false)).toEqual(["doctor"]);
	});

	it("renders a boolean option as --flag when true, omitted when false and not negatable", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], { initial: true }, {})).toEqual(["package", "publish", "--initial"]);
		expect(buildChildArgv(entry, [], { skipAlreadyPublished: false }, {})).toEqual(["package", "publish"]);
	});

	it("renders a negatable boolean option as --no-flag when answered false", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], { provenance: false }, {})).toEqual(["package", "publish", "--no-provenance"]);
		expect(buildChildArgv(entry, [], { provenance: true }, {})).toEqual(["package", "publish", "--provenance"]);
	});

	it("renders a string option as --flag value, omitted when empty", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], { tag: "alpha" }, {})).toEqual(["package", "publish", "--tag", "alpha"]);
		expect(buildChildArgv(entry, [], { tag: "" }, {})).toEqual(["package", "publish"]);
	});

	it("renders an arity array option as --flag v1 v2", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], { syncTrust: ["old.yml", "new.yml"] }, {})).toEqual([
			"package",
			"publish",
			"--sync-trust",
			"old.yml",
			"new.yml",
		]);
	});

	it("never emits a secret option's flag or value", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], { otp: "123456" }, {})).toEqual(["package", "publish"]);
	});

	it("omits an option answer absent from optionAnswers", () => {
		expect(buildChildArgv(getEntry("package publish"), [], {}, {})).toEqual(["package", "publish"]);
	});
});

describe("secretEnv", () => {
	it("maps a secret option's camelCase key to HOLOCRON_<SCREAMING_SNAKE_CASE>", () => {
		expect(secretEnv(getEntry("package publish"), { otp: "123456" })).toEqual({ HOLOCRON_OTP: "123456" });
	});

	it("omits a non-secret option even when present in the answers", () => {
		expect(secretEnv(getEntry("package publish"), { tag: "alpha", otp: "123456" })).toEqual({
			HOLOCRON_OTP: "123456",
		});
	});

	it("omits a secret option that was never answered or answered empty", () => {
		expect(secretEnv(getEntry("package publish"), {})).toEqual({});
		expect(secretEnv(getEntry("package publish"), { otp: "" })).toEqual({});
	});
});
