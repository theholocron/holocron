import { describe, expect, it } from "vitest";

import type { OptionPrompt, ResolvedOptions } from "../../prompts/index.js";
import { entry } from "../__tests__/fixtures.js";
import { buildChildArgv } from "./build-child-argv.js";

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

describe("buildChildArgv", () => {
	it("splits a multi-word command name into tokens", () => {
		expect(buildChildArgv(entry("auth set"), ["github"], EMPTY_RESOLVED, {})).toEqual(["auth", "set", "github"]);
	});

	it("appends resolved positionals, options, then forwarded flags, in order", () => {
		expect(buildChildArgv(entry("deploy"), ["main"], EMPTY_RESOLVED, { dryRun: true, org: "theholocron" })).toEqual(
			["deploy", "main", "--org", "theholocron", "--dry-run"]
		);
	});

	it("handles a command with no positionals", () => {
		expect(buildChildArgv(entry("doctor"), [], EMPTY_RESOLVED, {})).toEqual(["doctor"]);
	});

	it("passes a dryRunOverride through to forwardedFlags", () => {
		expect(buildChildArgv(entry("doctor"), [], EMPTY_RESOLVED, {}, true)).toEqual(["doctor", "--dry-run"]);
		expect(buildChildArgv(entry("doctor"), [], EMPTY_RESOLVED, { dryRun: true }, false)).toEqual(["doctor"]);
	});

	it("renders a boolean option as --flag when true, omitted when false and not negatable", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(INITIAL_OPTION, true), {})).toEqual([
			"package",
			"publish",
			"--initial",
		]);
		expect(buildChildArgv(target, [], resolved(SKIP_ALREADY_OPTION, false), {})).toEqual(["package", "publish"]);
	});

	it("renders a negatable boolean option as --no-flag when answered false", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(PROVENANCE_OPTION, false), {})).toEqual([
			"package",
			"publish",
			"--no-provenance",
		]);
		expect(buildChildArgv(target, [], resolved(PROVENANCE_OPTION, true), {})).toEqual([
			"package",
			"publish",
			"--provenance",
		]);
	});

	it("renders a string option as --flag value, omitted when empty", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(TAG_OPTION, "alpha"), {})).toEqual([
			"package",
			"publish",
			"--tag",
			"alpha",
		]);
		expect(buildChildArgv(target, [], resolved(TAG_OPTION, ""), {})).toEqual(["package", "publish"]);
	});

	it("renders an arity array option as --flag v1 v2", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(SYNC_TRUST_OPTION, ["old.yml", "new.yml"]), {})).toEqual([
			"package",
			"publish",
			"--sync-trust",
			"old.yml",
			"new.yml",
		]);
	});

	it("omits an array option's flag entirely when the array is empty (patch coverage)", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(SYNC_TRUST_OPTION, []), {})).toEqual(["package", "publish"]);
	});

	it("never emits a secret option's flag or value", () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(OTP_OPTION, "123456"), {})).toEqual(["package", "publish"]);
	});

	it('never emits a type: "password" option\'s flag or value, even without secret: true set (holocron#1076 review)', () => {
		const target = entry("package publish");
		expect(buildChildArgv(target, [], resolved(PASSWORD_WITHOUT_SECRET_OPTION, "1234"), {})).toEqual([
			"package",
			"publish",
		]);
	});

	it("omits an option answer absent from the resolved answers", () => {
		expect(buildChildArgv(entry("package publish"), [], EMPTY_RESOLVED, {})).toEqual(["package", "publish"]);
	});
});
