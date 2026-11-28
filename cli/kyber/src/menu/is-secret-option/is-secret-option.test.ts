import { describe, expect, it } from "vitest";

import { isSecretOption } from "./is-secret-option.js";

describe("isSecretOption", () => {
	it("is true for an explicit secret and for any password-typed option", () => {
		expect(isSecretOption({ key: "a", flag: "--a", type: "input", secret: true, message: "" })).toBe(true);
		expect(isSecretOption({ key: "a", flag: "--a", type: "password", message: "" })).toBe(true);
	});

	it("is false otherwise", () => {
		expect(isSecretOption({ key: "a", flag: "--a", type: "input", message: "" })).toBe(false);
	});
});
