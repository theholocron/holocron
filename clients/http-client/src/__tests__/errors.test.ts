import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../errors.js";

describe("ProviderApiError", () => {
	it("name is 'ProviderApiError'", () => {
		const err = new ProviderApiError("msg", 404);
		expect(err.name).toBe("ProviderApiError");
	});

	it("carries status and details", () => {
		const err = new ProviderApiError("Bad creds", 401, "Unauthorized");
		expect(err.status).toBe(401);
		expect(err.details).toBe("Unauthorized");
		expect(err.message).toBe("Bad creds");
	});

	it("instanceof Error", () => {
		expect(new ProviderApiError("x", 0)).toBeInstanceOf(Error);
	});
});
