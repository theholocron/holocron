import { describe, expect, it } from "vitest";

describe("@theholocron/github-app", () => {
	it("imports cleanly (scaffolding only — see .notes/tech-github-app-v1.spec.md)", async () => {
		await expect(import("./index.js")).resolves.toBeDefined();
	});
});
