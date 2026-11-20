import { describe, expect, it } from "vitest";

import { planType } from "./plan-type.js";

describe("planType", () => {
	it.each([
		[["bug"], "Bug"],
		[["enhancement"], "Feature"],
		[["chore", "released"], "Task"],
		[["Bug", "bug"], "Bug"],
	])("gives %j the Type %s", (labels, set) => {
		expect(planType({ type: null, labels })).toEqual({ set });
	});

	it("keeps a Type that is there, whatever the labels say", () => {
		expect(planType({ type: "Task", labels: ["bug"] })).toEqual({ skip: "typed" });
	});

	it("has no source with no kind label", () => {
		expect(planType({ type: null, labels: ["released", "documentation"] })).toEqual({ skip: "no-kind-label" });
	});

	it("leaves two kind labels for a person", () => {
		expect(planType({ type: null, labels: ["enhancement", "bug"] })).toEqual({
			skip: "ambiguous",
			labels: ["enhancement", "bug"],
		});
	});
});
