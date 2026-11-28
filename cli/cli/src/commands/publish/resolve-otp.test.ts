import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { describe, expect, it } from "vitest";

import { resolveOtp } from "./resolve-otp.js";

describe("resolveOtp", () => {
	it("returns argv.otp when given, ignoring HOLOCRON_OTP", () => {
		expect(resolveOtp("111111", createEnvLookup({ HOLOCRON_OTP: "222222" }))).toBe("111111");
	});

	it("falls back to HOLOCRON_OTP when argv.otp is absent", () => {
		expect(resolveOtp(undefined, createEnvLookup({ HOLOCRON_OTP: "222222" }))).toBe("222222");
	});

	it("returns undefined when neither is set", () => {
		expect(resolveOtp(undefined, createEnvLookup({}))).toBeUndefined();
	});
});
