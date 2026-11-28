import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../../plugin/index.js";
import { describeProviderError, providerMessage } from "./describe-provider-error.js";

describe("providerMessage", () => {
	it("is undefined for no body", () => {
		expect(providerMessage(undefined)).toBeUndefined();
		expect(providerMessage(null)).toBeUndefined();
		expect(providerMessage("")).toBeUndefined();
	});

	it("takes the message field of a JSON body, else the error field", () => {
		expect(providerMessage('{"message":"name is required","status":400}')).toBe("name is required");
		expect(providerMessage('{"error":"plan limit reached"}')).toBe("plan limit reached");
	});

	it("takes the message of an error object, however deep", () => {
		expect(providerMessage('{"error":{"message":"bad field"}}')).toBe("bad field");
		expect(providerMessage('{"error":{"code":1}}')).toBe('{"error":{"code":1}}');
	});

	it("reads a body that is already an object", () => {
		expect(providerMessage({ message: "from an object" })).toBe("from an object");
	});

	it("keeps the text of a body with neither field, or that is not JSON", () => {
		expect(providerMessage('{"status":400}')).toBe('{"status":400}');
		expect(providerMessage("<html>Bad gateway</html>")).toBe("<html>Bad gateway</html>");
		expect(providerMessage('"just a string"')).toBe('"just a string"');
		expect(providerMessage("42")).toBe("42");
	});

	it("skips an empty message or error field", () => {
		expect(providerMessage('{"message":"","error":"real"}')).toBe("real");
	});
});

describe("describeProviderError", () => {
	it("appends the provider's message, not its whole body", () => {
		const err = new ProviderApiError(
			"Checkly POST /dashboards → 400",
			400,
			'{"message":"header is required","x":1}'
		);
		expect(describeProviderError(err)).toBe("Checkly POST /dashboards → 400: header is required");
	});

	it("cuts a long text body and strips control characters", () => {
		const err = new ProviderApiError("Failed", 500, `start\n${"x".repeat(500)}`);
		const said = describeProviderError(err);
		expect(said).toMatch(/^Failed: start x+…$/);
		expect(said).not.toContain("\n");
	});

	it("is the message alone for an error with no body, and for a thrown value that is not an Error", () => {
		expect(describeProviderError(new ProviderApiError("Server error", 500))).toBe("Server error");
		expect(describeProviderError("boom")).toBe("boom");
	});
});
