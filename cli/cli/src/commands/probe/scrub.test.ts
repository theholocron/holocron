import { describe, expect, it } from "vitest";

import { createScrubber } from "./scrub.js";

describe("createScrubber", () => {
	it("hides a value it was given, wherever it appears", () => {
		const scrub = createScrubber(["s3cr3t-value"]);
		expect(scrub("secret is s3cr3t-value, again s3cr3t-value")).toBe("secret is «hidden», again «hidden»");
	});

	it("reads the secrets again on each use, so one added later is hidden", () => {
		const secrets = new Set<string>();
		const scrub = createScrubber(secrets);
		expect(scrub("late-secret")).toBe("late-secret");
		secrets.add("late-secret");
		expect(scrub("late-secret")).toBe("«hidden»");
	});

	it("leaves short values alone, which would mangle ordinary words", () => {
		expect(createScrubber(["ab", ""])("a cab is abc")).toBe("a cab is abc");
	});

	it("treats a value as text, not a pattern", () => {
		expect(createScrubber(["a.b*c+d?e"])("x a.b*c+d?e y axbbcde")).toBe("x «hidden» y axbbcde");
	});

	it("hides credential shapes it was not told about", () => {
		const scrub = createScrubber([]);
		expect(scrub("POST https://discord.com/api/webhooks/123456789/abc_DEF-ghi done")).toBe("POST «hidden» done");
		expect(scrub("Authorization: Bearer abc.def-123")).toBe("Authorization: «hidden»");
		expect(scrub("token sntryu_AbC123+/=_- ok")).toBe("token «hidden» ok");
	});

	it("hides the longer of two overlapping values first", () => {
		expect(createScrubber(["secret-token", "secret-token-long"])("secret-token-long")).toBe("«hidden»");
	});
});
