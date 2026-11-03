import { describe, expect, it } from "vitest";

import { workflowKey } from "./workflow-key.js";

describe("workflowKey", () => {
	it("an old name is its own key", () => {
		expect(workflowKey("verification.unitTests")).toBe("verification.unitTests");
		expect(workflowKey("stale")).toBe("stale");
	});

	it("a flat id maps back to the old name it replaced", () => {
		expect(workflowKey("test:unit")).toBe("verification.unitTests");
		expect(workflowKey("deploy-docs")).toBe("knowledge.docs");
		expect(workflowKey("mark-stale")).toBe("stale");
		expect(workflowKey("format")).toBe("sourceQuality.formatting");
	});

	it("a name with neither (preview, unknown) is its own key", () => {
		expect(workflowKey("preview")).toBe("preview");
		expect(workflowKey("nope")).toBe("nope");
	});
});
