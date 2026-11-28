import { describe, expect, it } from "vitest";

import { ConfigError } from "./config-error.js";

describe("ConfigError", () => {
	it("is an Error named ConfigError", () => {
		const err = new ConfigError("bad");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("ConfigError");
		expect(err.message).toBe("bad");
	});
});
