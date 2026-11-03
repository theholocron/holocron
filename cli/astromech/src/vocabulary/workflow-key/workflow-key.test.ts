import { describe, expect, it } from "vitest";

import { workflowKey } from "./workflow-key.js";

describe("workflowKey", () => {
	it("a flat id is its own key", () => {
		expect(workflowKey("test:unit")).toBe("test:unit");
		expect(workflowKey("deploy-docs")).toBe("deploy-docs");
		expect(workflowKey("mark-stale")).toBe("mark-stale");
	});

	it("an old name maps to the first id that replaced it", () => {
		expect(workflowKey("verification.unitTests")).toBe("test:unit");
		expect(workflowKey("stale")).toBe("mark-stale");
		expect(workflowKey("sourceQuality.formatting")).toBe("lint:editorconfig");
	});

	it("a split successor of the old formatting workflow has a workflow of its own", () => {
		expect(workflowKey("lint:markdown")).toBe("lint:markdown");
		expect(workflowKey("lint:editorconfig")).toBe("lint:editorconfig");
	});

	it("a task with no workflow of its own maps to the workflow that hosts its check", () => {
		expect(workflowKey("format")).toBe("lint:code");
	});

	it("a name with no old name (preview, unknown) is its own key", () => {
		expect(workflowKey("preview")).toBe("preview");
		expect(workflowKey("nope")).toBe("nope");
	});
});
