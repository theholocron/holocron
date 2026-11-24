import { describe, expect, it } from "vitest";

import { workflowTitle } from "./workflow-title.js";

describe("workflowTitle", () => {
	it("title-cases the words of a hyphenated id", () => {
		expect(workflowTitle("deploy-sentinel")).toBe("Deploy Sentinel");
	});

	it("joins the suite and the leaf of a colon id with a space", () => {
		expect(workflowTitle("test:unit")).toBe("Test Unit");
	});

	it("writes a one-word id in title case", () => {
		expect(workflowTitle("typecheck")).toBe("Typecheck");
	});

	it("keeps an acronym in capitals", () => {
		expect(workflowTitle("ci")).toBe("CI");
		expect(workflowTitle("reconcile-ci")).toBe("Reconcile CI");
		expect(workflowTitle("validate:dco")).toBe("Validate DCO");
	});
});
