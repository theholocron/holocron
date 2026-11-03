import { describe, expect, it } from "vitest";

import { TASKS } from "../../registry/index.js";
import { legacyName, ownLegacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES } from "./legacy-names.js";

describe("LEGACY_NAMES", () => {
	it("maps every old dotted name of the spec to its flat id", () => {
		expect(LEGACY_NAMES["verification.unitTests"]).toEqual([{ id: "test:unit" }]);
		expect(LEGACY_NAMES["delivery.publish"]).toEqual([{ id: "release" }]);
		expect(LEGACY_NAMES["knowledge.wiki"]).toEqual([{ id: "publish-wiki" }]);
		expect(LEGACY_NAMES["stale"]).toEqual([{ id: "mark-stale" }]);
	});

	it("maps the formatting workflow to its three successors in run order, prettier read-only", () => {
		expect(LEGACY_NAMES["sourceQuality.formatting"]).toEqual([
			{ id: "lint:editorconfig" },
			{ id: "lint:markdown" },
			{ id: "format", passthrough: ["--check"] },
		]);
	});

	it("only names ids the registry has, except the workflow-only ones", () => {
		const workflowOnly = new Set(["check-dispatched", "label", "greet", "mark-stale", "update-deps", "annotate"]);
		const ids = Object.values(LEGACY_NAMES).flatMap((targets) => targets.map((t) => t.id));
		expect(ids.filter((id) => TASKS[id] === undefined && !workflowOnly.has(id))).toEqual([]);
	});

	it("lists no flat id under two old names", () => {
		const ids = Object.values(LEGACY_NAMES).flatMap((targets) => targets.map((t) => t.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("never lists a flat id as an old name (an old name is dotted or a workflow key)", () => {
		expect(Object.keys(LEGACY_NAMES).filter((legacy) => TASKS[legacy] !== undefined)).toEqual([]);
	});
});

describe("legacyName", () => {
	it("is the old name a flat id replaced, and undefined for one that never had one", () => {
		expect(legacyName("test:unit")).toBe("verification.unitTests");
		expect(legacyName("release")).toBe("delivery.publish");
		expect(legacyName("check-dispatched")).toBe("platform.dispatchedCheck");
		expect(legacyName("nope")).toBeUndefined();
	});

	it("gives the formatting workflow to each of its three successors", () => {
		for (const id of ["lint:editorconfig", "lint:markdown", "format"]) {
			expect(legacyName(id)).toBe("sourceQuality.formatting");
		}
	});
});

describe("ownLegacyName", () => {
	it("is the old name only when it stood for that id alone", () => {
		expect(ownLegacyName("lint:code")).toBe("sourceQuality.staticAnalysis");
		expect(ownLegacyName("format")).toBeUndefined();
		expect(ownLegacyName("lint:markdown")).toBeUndefined();
		expect(ownLegacyName("nope")).toBeUndefined();
	});
});
