import { describe, expect, it } from "vitest";

import { MissingTokenError } from "../../plugin/index.js";
import { missingTokenReason } from "./missing-token.js";

describe("missingTokenReason", () => {
	it("returns the message of a missing-token error, from the CLI or from a plugin", () => {
		expect(missingTokenReason(new MissingTokenError("no GitHub token"))).toBe("no GitHub token");
		const fromPlugin = Object.assign(new Error("no Checkly token found"), { name: "AuthError" });
		expect(missingTokenReason(fromPlugin)).toBe("no Checkly token found");
	});

	it("returns nothing for any other error or value", () => {
		expect(missingTokenReason(new Error("boom"))).toBeUndefined();
		expect(missingTokenReason("AuthError")).toBeUndefined();
	});
});
