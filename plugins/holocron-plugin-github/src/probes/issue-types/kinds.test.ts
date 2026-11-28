import { describe, expect, it } from "vitest";

import { DEFAULT_FALLBACK_KINDS, DEFAULT_MAIN_KINDS, resolveKinds, unknownTypes } from "./kinds.js";

describe("resolveKinds", () => {
	it("is exactly today's table with no config, including the Task labels", () => {
		expect(resolveKinds({})).toEqual({ main: DEFAULT_MAIN_KINDS, fallback: DEFAULT_FALLBACK_KINDS });
		expect(DEFAULT_MAIN_KINDS).toEqual({ bug: "Bug", enhancement: "Feature", chore: "Task" });
		expect(Object.keys(DEFAULT_FALLBACK_KINDS)).toEqual([
			"ci",
			"documentation",
			"refactor",
			"test",
			"performance",
			"dependencies",
		]);
		expect(new Set(Object.values(DEFAULT_FALLBACK_KINDS))).toEqual(new Set(["Task"]));
	});

	it("replaces one table and keeps the other's default, lower-casing the labels", () => {
		expect(resolveKinds({ kinds: { Defect: "Bug" } })).toEqual({
			main: { defect: "Bug" },
			fallback: DEFAULT_FALLBACK_KINDS,
		});
		expect(resolveKinds({ fallbackKinds: {} })).toEqual({ main: DEFAULT_MAIN_KINDS, fallback: {} });
	});
});

describe("unknownTypes", () => {
	it("names each Type the organization lacks once, with the labels that use it", () => {
		const kinds = resolveKinds({ kinds: { a: "Epic", b: "Epic", c: "Bug" }, fallbackKinds: { d: "Spike" } });
		expect(unknownTypes(kinds, new Set(["Bug"]))).toEqual([
			{ type: "Epic", labels: ["a", "b"] },
			{ type: "Spike", labels: ["d"] },
		]);
	});

	it("finds nothing when every Type exists", () => {
		expect(unknownTypes(resolveKinds({}), new Set(["Bug", "Feature", "Task"]))).toEqual([]);
	});
});
