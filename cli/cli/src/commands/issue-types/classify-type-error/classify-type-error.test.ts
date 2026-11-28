import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../../plugin/index.js";
import { classifyTypeError } from "./classify-type-error.js";

describe("classifyTypeError", () => {
	it.each([
		[new ProviderApiError("x", 429), "rate-limit"],
		[new ProviderApiError("API rate limit exceeded", 403), "rate-limit"],
		[new ProviderApiError("x", 403, "secondary rate limit"), "rate-limit"],
		[new ProviderApiError("x", 403), "refused"],
		[new ProviderApiError("x", 401), "refused"],
		[new ProviderApiError("x", 409), "conflict"],
		[new ProviderApiError("x", 422), "conflict"],
		[new ProviderApiError("x", 500), "other"],
		[new Error("x"), "other"],
	])("reads %j as %s", (err, kind) => {
		expect(classifyTypeError(err)).toBe(kind);
	});
});
