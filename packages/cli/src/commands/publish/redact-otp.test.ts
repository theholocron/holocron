import { describe, expect, it } from "vitest";

import { redactOtp } from "./redact-otp.js";

describe("redactOtp", () => {
	it("replaces the otp value with *** wherever it appears in args", () => {
		expect(redactOtp(["publish", "--otp", "123456", "--tag", "alpha"], "123456")).toEqual([
			"publish",
			"--otp",
			"***",
			"--tag",
			"alpha",
		]);
	});

	it("returns a copy of args unchanged when otp is undefined", () => {
		const args = ["publish", "--tag", "alpha"];
		expect(redactOtp(args, undefined)).toEqual(args);
	});

	it("returns a copy of args unchanged when otp is an empty string", () => {
		const args = ["publish", "--tag", "alpha"];
		expect(redactOtp(args, "")).toEqual(args);
	});
});
