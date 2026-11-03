import { describe, expect, it } from "vitest";

import { workflowFile } from "./workflow-file.js";

describe("workflowFile", () => {
	it("turns the colon of a suite leaf into a hyphen", () => {
		expect(workflowFile("test:unit")).toBe("test-unit.yml");
		expect(workflowFile("lint:markdown")).toBe("lint-markdown.yml");
	});

	it("leaves an id with no suite as it is", () => {
		expect(workflowFile("typecheck")).toBe("typecheck.yml");
		expect(workflowFile("deploy-preview")).toBe("deploy-preview.yml");
	});
});
