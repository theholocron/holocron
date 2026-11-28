import { describe, expect, it } from "vitest";

import { scriptName } from "./script-name.js";

describe("scriptName", () => {
	it("replaces the first hyphen of a hyphen compound with a colon", () => {
		expect(scriptName("deploy-preview")).toBe("deploy:preview");
		expect(scriptName("sync-repo")).toBe("sync:repo");
		expect(scriptName("sync-templates")).toBe("sync:templates");
	});

	it("leaves a verb and a suite leaf as they are", () => {
		expect(scriptName("build")).toBe("build");
		expect(scriptName("test:unit")).toBe("test:unit");
	});
});
