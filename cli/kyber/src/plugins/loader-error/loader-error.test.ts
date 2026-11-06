import { describe, expect, it } from "vitest";

import { LoaderError } from "./loader-error.js";

describe("LoaderError", () => {
	it("is an Error named LoaderError", () => {
		const err = new LoaderError("boom");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("LoaderError");
		expect(err.message).toBe("boom");
	});
});
