import { describe, expect, it } from "vitest";

describe("@theholocron/sentinel", () => {
	it("imports cleanly (scaffolding only — see .notes/tech-sentinel-v1.spec.md)", async () => {
		await expect(import("./index.js")).resolves.toBeDefined();
	});
});
