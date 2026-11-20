import { describe, expect, it } from "vitest";

import { resolveKinds } from "./kinds.js";
import { planType } from "./plan-type.js";

const KINDS = resolveKinds({});

describe("planType", () => {
	it.each([
		[["bug"], "Bug"],
		[["enhancement"], "Feature"],
		[["chore", "released"], "Task"],
		[["Bug", "bug"], "Bug"],
	])("gives %j the Type %s", (labels, set) => {
		expect(planType({ type: null, labels }, KINDS)).toEqual({ set });
	});

	it("keeps a Type that is there, whatever the labels say", () => {
		expect(planType({ type: "Task", labels: ["bug"] }, KINDS)).toEqual({ skip: "typed" });
	});

	it("has no source with no label that maps to a Type", () => {
		expect(planType({ type: null, labels: ["released", "wontfix"] }, KINDS)).toEqual({ skip: "no-kind-label" });
		expect(planType({ type: null, labels: [] }, KINDS)).toEqual({ skip: "no-kind-label" });
	});

	it.each(["ci", "documentation", "refactor", "test", "performance", "dependencies"])(
		"gives an issue with only %s the Type Task",
		(label) => {
			expect(planType({ type: null, labels: ["released", label.toUpperCase()] }, KINDS)).toEqual({ set: "Task" });
		}
	);

	it("gives several other kind labels one Task, with no conflict", () => {
		expect(planType({ type: null, labels: ["ci", "test", "refactor"] }, KINDS)).toEqual({ set: "Task" });
	});

	it("lets the three main labels win over the others", () => {
		expect(planType({ type: null, labels: ["ci", "bug"] }, KINDS)).toEqual({ set: "Bug" });
		expect(planType({ type: null, labels: ["documentation", "enhancement"] }, KINDS)).toEqual({ set: "Feature" });
		expect(planType({ type: null, labels: ["chore", "dependencies"] }, KINDS)).toEqual({ set: "Task" });
	});

	it("never changes a Type that is set, even with only other kind labels", () => {
		expect(planType({ type: "Bug", labels: ["ci"] }, KINDS)).toEqual({ skip: "typed" });
	});

	it("still lists two main labels for a person when another kind label is there", () => {
		expect(planType({ type: null, labels: ["bug", "enhancement", "ci"] }, KINDS)).toEqual({
			skip: "ambiguous",
			labels: ["bug", "enhancement"],
		});
	});

	it("leaves two kind labels for a person", () => {
		expect(planType({ type: null, labels: ["enhancement", "bug"] }, KINDS)).toEqual({
			skip: "ambiguous",
			labels: ["enhancement", "bug"],
		});
	});
});

describe("planType with kind tables from the config", () => {
	const custom = resolveKinds({
		kinds: { Defect: "Bug", Request: "Feature", Fix: "Bug" },
		fallbackKinds: { Docs: "Task", Spike: "Research" },
	});

	it("uses the configured labels, whatever their case, and none of the defaults", () => {
		expect(planType({ type: null, labels: ["defect"] }, custom)).toEqual({ set: "Bug" });
		expect(planType({ type: null, labels: ["bug"] }, custom)).toEqual({ skip: "no-kind-label" });
	});

	it("sets one Type when two labels mean the same", () => {
		expect(planType({ type: null, labels: ["defect", "fix"] }, custom)).toEqual({ set: "Bug" });
	});

	it("lists labels that mean two Types, and lets the main table win over the fallback", () => {
		expect(planType({ type: null, labels: ["Defect", "Request"] }, custom)).toEqual({
			skip: "ambiguous",
			labels: ["defect", "request"],
		});
		expect(planType({ type: null, labels: ["docs", "request"] }, custom)).toEqual({ set: "Feature" });
	});

	it("reads the fallback table when no main label is there, and lists a conflict in it", () => {
		expect(planType({ type: null, labels: ["docs"] }, custom)).toEqual({ set: "Task" });
		expect(planType({ type: null, labels: ["docs", "spike"] }, custom)).toEqual({
			skip: "ambiguous",
			labels: ["docs", "spike"],
		});
	});

	it("turns a table off with an empty one", () => {
		const off = resolveKinds({ fallbackKinds: {} });
		expect(planType({ type: null, labels: ["ci"] }, off)).toEqual({ skip: "no-kind-label" });
		expect(planType({ type: null, labels: ["bug"] }, off)).toEqual({ set: "Bug" });
	});
});
