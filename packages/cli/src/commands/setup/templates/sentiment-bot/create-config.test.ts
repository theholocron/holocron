import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("sentiment-bot createConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("contains the toxicity threshold", () => {
		expect(createConfig()).toContain("sentimentBotToxicityThreshold: .7");
	});

	it("contains the reply comment", () => {
		expect(createConfig()).toContain("sentimentBotReplyComment");
	});

	it("links to the Code of Conduct", () => {
		expect(createConfig()).toContain("code-of-conduct");
	});
});
