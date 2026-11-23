import { describe, expect, it } from "vitest";

import { droppedKind, kindLabels, kindOfLabels, labelsFor } from "./issue-kind.js";

describe("kindLabels", () => {
	it("is the core three with nothing declared", () => {
		const kinds = kindLabels(undefined);
		expect(["bug", "feature", "task"].map((k) => kinds.labelOf(k))).toEqual(["bug", "enhancement", "chore"]);
		expect(kinds.labelOf("epic")).toBeUndefined();
	});

	it("gives a declared Type its label, else its name in lower case, and a core kind keeps its own label", () => {
		const kinds = kindLabels([{ name: "Epic" }, { name: "Spike", label: "research" }, { name: "Feature" }]);
		expect(kinds.labelOf("epic")).toBe("epic");
		expect(kinds.labelOf("spike")).toBe("research");
		expect(kinds.labelOf("feature")).toBe("enhancement");
		expect(kinds.labels()).toEqual(["bug", "enhancement", "chore", "epic", "research"]);
	});

	it("reads a label back as its kind, ignoring case, and a stranger as none", () => {
		const kinds = kindLabels([{ name: "Spike", label: "research" }]);
		expect(kinds.kindOf("Research")).toBe("spike");
		expect(kinds.kindOf("area:cli")).toBeUndefined();
	});
});

describe("kindOfLabels, labelsFor and droppedKind with declared Types", () => {
	const kinds = kindLabels([{ name: "Epic" }]);

	it("names an Epic from its label, and none for two kinds", () => {
		expect(kindOfLabels(["x", "epic"], kinds)).toBe("epic");
		expect(kindOfLabels(["epic", "bug"], kinds)).toBeUndefined();
		expect(kindOfLabels(["epic"])).toBeUndefined();
	});

	it("adds the declared label to a record once", () => {
		expect(labelsFor({ labels: ["a"], kind: "epic" }, kinds)).toEqual(["a", "epic"]);
		expect(labelsFor({ labels: ["Epic"], kind: "epic" }, kinds)).toEqual(["Epic"]);
	});

	it("drops a kind with no label, naming why, and never one that has one", () => {
		expect(droppedKind({ kind: "spike" }, kinds)).toBe("kind spike (not carried: no Linear label)");
		expect(labelsFor({ labels: ["a"], kind: "spike" }, kinds)).toEqual(["a"]);
		expect(droppedKind({ kind: "epic" }, kinds)).toBeUndefined();
		expect(droppedKind({}, kinds)).toBeUndefined();
	});
});
