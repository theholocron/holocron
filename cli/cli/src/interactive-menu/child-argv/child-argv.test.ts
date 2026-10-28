import { describe, expect, it } from "vitest";

import type { OptionPrompt, ResolvedOptions } from "../../ui/index.js";
import { buildChildArgv, forwardedFlags, secretEnv } from "../child-argv/index.js";
import { getEntry } from "../command-registry/index.js";

const EMPTY_RESOLVED: ResolvedOptions = { options: [], answers: {} };

/** A ResolvedOptions with one option, for the single-option rendering tests below. */
function resolved(option: OptionPrompt, answer: ResolvedOptions["answers"][string]): ResolvedOptions {
	return { options: [option], answers: { [option.key]: answer } };
}

const INITIAL_OPTION: OptionPrompt = { key: "initial", flag: "--initial", type: "confirm", message: "Initial?" };
const SKIP_ALREADY_OPTION: OptionPrompt = {
	key: "skipAlreadyPublished",
	flag: "--skip-already-published",
	type: "confirm",
	message: "Skip?",
};
const PROVENANCE_OPTION: OptionPrompt = {
	key: "provenance",
	flag: "--provenance",
	type: "confirm",
	negatable: true,
	message: "Provenance?",
};
const TAG_OPTION: OptionPrompt = { key: "tag", flag: "--tag", type: "input", message: "Tag:" };
const SYNC_TRUST_OPTION: OptionPrompt = {
	key: "syncTrust",
	flag: "--sync-trust",
	type: "input",
	arity: 2,
	message: "File:",
};
const OTP_OPTION: OptionPrompt = { key: "otp", flag: "--otp", type: "password", secret: true, message: "OTP:" };
/** `type: "password"` but `secret` left unset — must still be treated as secret (holocron#1076 review). */
const PASSWORD_WITHOUT_SECRET_OPTION: OptionPrompt = { key: "pin", flag: "--pin", type: "password", message: "PIN:" };

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
		expect(buildChildArgv(getEntry("auth set"), ["github"], EMPTY_RESOLVED, {})).toEqual(["auth", "set", "github"]);
	});

	it("appends resolved positionals, options, then forwarded flags, in order", () => {
		expect(
			buildChildArgv(getEntry("deploy"), ["main"], EMPTY_RESOLVED, { dryRun: true, org: "theholocron" })
		).toEqual(["deploy", "main", "--org", "theholocron", "--dry-run"]);
	});

	it("handles a command with no positionals", () => {
		expect(buildChildArgv(getEntry("doctor"), [], EMPTY_RESOLVED, {})).toEqual(["doctor"]);
	});

	it("passes a dryRunOverride through to forwardedFlags", () => {
		expect(buildChildArgv(getEntry("doctor"), [], EMPTY_RESOLVED, {}, true)).toEqual(["doctor", "--dry-run"]);
		expect(buildChildArgv(getEntry("doctor"), [], EMPTY_RESOLVED, { dryRun: true }, false)).toEqual(["doctor"]);
	});

	it("renders a boolean option as --flag when true, omitted when false and not negatable", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(INITIAL_OPTION, true), {})).toEqual([
			"package",
			"publish",
			"--initial",
		]);
		expect(buildChildArgv(entry, [], resolved(SKIP_ALREADY_OPTION, false), {})).toEqual(["package", "publish"]);
	});

	it("renders a negatable boolean option as --no-flag when answered false", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(PROVENANCE_OPTION, false), {})).toEqual([
			"package",
			"publish",
			"--no-provenance",
		]);
		expect(buildChildArgv(entry, [], resolved(PROVENANCE_OPTION, true), {})).toEqual([
			"package",
			"publish",
			"--provenance",
		]);
	});

	it("renders a string option as --flag value, omitted when empty", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(TAG_OPTION, "alpha"), {})).toEqual([
			"package",
			"publish",
			"--tag",
			"alpha",
		]);
		expect(buildChildArgv(entry, [], resolved(TAG_OPTION, ""), {})).toEqual(["package", "publish"]);
	});

	it("renders an arity array option as --flag v1 v2", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(SYNC_TRUST_OPTION, ["old.yml", "new.yml"]), {})).toEqual([
			"package",
			"publish",
			"--sync-trust",
			"old.yml",
			"new.yml",
		]);
	});

	it("omits an array option's flag entirely when the array is empty (patch coverage)", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(SYNC_TRUST_OPTION, []), {})).toEqual(["package", "publish"]);
	});

	it("never emits a secret option's flag or value", () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(OTP_OPTION, "123456"), {})).toEqual(["package", "publish"]);
	});

	it('never emits a type: "password" option\'s flag or value, even without secret: true set (holocron#1076 review)', () => {
		const entry = getEntry("package publish");
		expect(buildChildArgv(entry, [], resolved(PASSWORD_WITHOUT_SECRET_OPTION, "1234"), {})).toEqual([
			"package",
			"publish",
		]);
	});

	it("omits an option answer absent from the resolved answers", () => {
		expect(buildChildArgv(getEntry("package publish"), [], EMPTY_RESOLVED, {})).toEqual(["package", "publish"]);
	});
});

describe("secretEnv", () => {
	it("maps a secret option's camelCase key to HOLOCRON_<SCREAMING_SNAKE_CASE>", () => {
		expect(secretEnv(resolved(OTP_OPTION, "123456"))).toEqual({ HOLOCRON_OTP: "123456" });
	});

	it("omits a non-secret option even when present in the answers", () => {
		expect(secretEnv({ options: [TAG_OPTION, OTP_OPTION], answers: { tag: "alpha", otp: "123456" } })).toEqual({
			HOLOCRON_OTP: "123456",
		});
	});

	it("omits a secret option that was never answered or answered empty", () => {
		expect(secretEnv({ options: [OTP_OPTION], answers: {} })).toEqual({});
		expect(secretEnv(resolved(OTP_OPTION, ""))).toEqual({});
	});

	it('delivers a type: "password" option via env even without secret: true set (holocron#1076 review)', () => {
		expect(secretEnv(resolved(PASSWORD_WITHOUT_SECRET_OPTION, "1234"))).toEqual({ HOLOCRON_PIN: "1234" });
	});
});
