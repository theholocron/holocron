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

	it("has no source with no label that maps to a Type", () => {
		expect(planType({ type: null, labels: ["released", "wontfix"] })).toEqual({ skip: "no-kind-label" });
		expect(planType({ type: null, labels: [] })).toEqual({ skip: "no-kind-label" });
	});

	it.each(["ci", "documentation", "refactor", "test", "performance", "dependencies"])(
		"gives an issue with only %s the Type Task",
		(label) => {
			expect(planType({ type: null, labels: ["released", label.toUpperCase()] })).toEqual({ set: "Task" });
		}
	);

	it("gives several other kind labels one Task, with no conflict", () => {
		expect(planType({ type: null, labels: ["ci", "test", "refactor"] })).toEqual({ set: "Task" });
	});

	it("lets the three main labels win over the others", () => {
		expect(planType({ type: null, labels: ["ci", "bug"] })).toEqual({ set: "Bug" });
		expect(planType({ type: null, labels: ["documentation", "enhancement"] })).toEqual({ set: "Feature" });
		expect(planType({ type: null, labels: ["chore", "dependencies"] })).toEqual({ set: "Task" });
	});

	it("never changes a Type that is set, even with only other kind labels", () => {
		expect(planType({ type: "Bug", labels: ["ci"] })).toEqual({ skip: "typed" });
	});

	it("still lists two main labels for a person when another kind label is there", () => {
		expect(planType({ type: null, labels: ["bug", "enhancement", "ci"] })).toEqual({
			skip: "ambiguous",
			labels: ["bug", "enhancement"],
		});
	});

	it("leaves two kind labels for a person", () => {
		expect(planType({ type: null, labels: ["enhancement", "bug"] })).toEqual({
			skip: "ambiguous",
			labels: ["enhancement", "bug"],
		});
	});
});
