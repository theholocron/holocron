import { describe, expect, it } from "vitest";

import { wedgeFix } from "./wedge-fix.js";

describe("wedgeFix", () => {
	it("names the tag and its note to delete", () => {
		const steps = wedgeFix("configs-v8.9.0-alpha.20").join("\n");
		expect(steps).toContain("git push --delete origin configs-v8.9.0-alpha.20");
		expect(steps).toContain(":refs/notes/semantic-release-configs-v8.9.0-alpha.20");
	});

	it("names both known causes", () => {
		const steps = wedgeFix("v1.0.0").join("\n");
		expect(steps).toContain("409");
		expect(steps).toContain("ENEEDAUTH");
		expect(steps).toContain("holocron publish package --sync-trust");
	});
});
