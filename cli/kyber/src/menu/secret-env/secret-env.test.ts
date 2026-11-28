import { describe, expect, it } from "vitest";

import type { OptionPrompt, ResolvedOptions } from "../../prompts/index.js";
import { secretEnv } from "./secret-env.js";

/** A ResolvedOptions with one option, for the single-option rendering tests below. */
function resolved(option: OptionPrompt, answer: ResolvedOptions["answers"][string]): ResolvedOptions {
	return { options: [option], answers: { [option.key]: answer } };
}

const TAG_OPTION: OptionPrompt = { key: "tag", flag: "--tag", type: "input", message: "Tag:" };
const OTP_OPTION: OptionPrompt = { key: "otp", flag: "--otp", type: "password", secret: true, message: "OTP:" };
/** `type: "password"` but `secret` left unset — must still be treated as secret (holocron#1076 review). */
const PASSWORD_WITHOUT_SECRET_OPTION: OptionPrompt = { key: "pin", flag: "--pin", type: "password", message: "PIN:" };

describe("secretEnv", () => {
	it("maps a secret option's camelCase key to <PREFIX>_<SCREAMING_SNAKE_CASE>", () => {
		expect(secretEnv(resolved(OTP_OPTION, "123456"), "MYCLI")).toEqual({ MYCLI_OTP: "123456" });
	});

	it("omits a non-secret option even when present in the answers", () => {
		expect(
			secretEnv({ options: [TAG_OPTION, OTP_OPTION], answers: { tag: "alpha", otp: "123456" } }, "MYCLI")
		).toEqual({
			MYCLI_OTP: "123456",
		});
	});

	it("omits a secret option that was never answered or answered empty", () => {
		expect(secretEnv({ options: [OTP_OPTION], answers: {} }, "MYCLI")).toEqual({});
		expect(secretEnv(resolved(OTP_OPTION, ""), "MYCLI")).toEqual({});
	});

	it('delivers a type: "password" option via env even without secret: true set (holocron#1076 review)', () => {
		expect(secretEnv(resolved(PASSWORD_WITHOUT_SECRET_OPTION, "1234"), "MYCLI")).toEqual({ MYCLI_PIN: "1234" });
	});

	it("renders a multi-word camelCase key in SCREAMING_SNAKE_CASE", () => {
		const option: OptionPrompt = {
			key: "apiKey",
			flag: "--api-key",
			type: "password",
			secret: true,
			message: "Key:",
		};
		expect(secretEnv(resolved(option, "k"), "MYCLI")).toEqual({ MYCLI_API_KEY: "k" });
	});
});
