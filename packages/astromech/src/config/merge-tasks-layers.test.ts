import { describe, expect, it } from "vitest";

import { mergeTasksLayers } from "./merge-tasks-layers.js";

describe("mergeTasksLayers", () => {
	it("returns {} when both sources are absent", () => {
		expect(mergeTasksLayers(undefined, undefined)).toEqual({});
	});

	it("concatenates task arrays, holocron.config's first, and lets the dedicated file win on scalars", () => {
		expect(
			mergeTasksLayers(["typecheck"], {
				tasks: [{ name: "platform.repoValidation", required: true }],
				syncScripts: false,
			})
		).toEqual({ tasks: ["typecheck", { name: "platform.repoValidation", required: true }], syncScripts: false });
	});

	it("accepts a bare item array from either source", () => {
		expect(mergeTasksLayers(undefined, ["lint"])).toEqual({ tasks: ["lint"] });
		expect(mergeTasksLayers({ tasks: ["lint"] }, undefined)).toEqual({ tasks: ["lint"] });
	});
});
