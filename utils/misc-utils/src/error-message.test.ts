import { describe, expect, it } from "vitest";

import { errorMessage } from "./error-message.ts";

describe("errorMessage", () => {
	it("returns .message for a real Error", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
	});

	it("subclasses of Error still use .message", () => {
		expect(errorMessage(new TypeError("bad type"))).toBe("bad type");
	});

	it("stringifies a thrown string", () => {
		expect(errorMessage("plain string boom")).toBe("plain string boom");
	});

	it("stringifies a thrown number", () => {
		expect(errorMessage(42)).toBe("42");
	});

	it("stringifies a non-Error object via its own toString", () => {
		expect(errorMessage({ toString: () => "custom" })).toBe("custom");
	});
});
