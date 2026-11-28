import { describe, expect, it } from "vitest";

import { legacyWorkflowKey } from "./legacy-workflow-key.js";

describe("legacyWorkflowKey", () => {
	it("a flat id is its own key", () => {
		expect(legacyWorkflowKey("test:unit")).toBe("test:unit");
		expect(legacyWorkflowKey("lint:editorconfig")).toBe("lint:editorconfig");
	});

	it("an old name maps to the first id that replaced it", () => {
		expect(legacyWorkflowKey("verification.unitTests")).toBe("test:unit");
		expect(legacyWorkflowKey("sourceQuality.formatting")).toBe("lint:editorconfig");
	});

	it("the other halves of the old formatting workflow map to the id that has its frozen reusable", () => {
		expect(legacyWorkflowKey("format")).toBe("lint:editorconfig");
		expect(legacyWorkflowKey("lint:markdown")).toBe("lint:editorconfig");
	});

	it("a name with no old name (preview, unknown) is its own key", () => {
		expect(legacyWorkflowKey("preview")).toBe("preview");
		expect(legacyWorkflowKey("nope")).toBe("nope");
	});
});
