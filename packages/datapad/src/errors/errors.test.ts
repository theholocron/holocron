import { describe, expect, it } from "vitest";

import { ConfigFileError } from "./errors.js";

describe("ConfigFileError", () => {
	it("is a real Error", () => {
		const err = new ConfigFileError("boom");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ConfigFileError);
	});

	it("sets name to ConfigFileError, not the base Error name", () => {
		expect(new ConfigFileError("boom").name).toBe("ConfigFileError");
	});

	it("carries the message through to Error.message", () => {
		expect(new ConfigFileError("app.config.ts is not valid JSON").message).toBe("app.config.ts is not valid JSON");
	});

	it("carries an optional filepath", () => {
		expect(new ConfigFileError("boom", "/repo/app.config.json").filepath).toBe("/repo/app.config.json");
	});

	it("leaves filepath undefined when omitted", () => {
		expect(new ConfigFileError("boom").filepath).toBeUndefined();
	});
});
