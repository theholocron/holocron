import { describe, expect, it } from "vitest";

import { coerceTasks } from "./coerce-tasks.js";

describe("coerceTasks", () => {
	it("returns undefined for an absent source", () => {
		expect(coerceTasks(undefined)).toBeUndefined();
		expect(coerceTasks(null as never)).toBeUndefined();
	});

	it("wraps a bare item array as { tasks }", () => {
		expect(coerceTasks(["lint"])).toEqual({ tasks: ["lint"] });
	});

	it("passes a config object through unchanged", () => {
		const config = { tasks: ["lint"], syncScripts: false };
		expect(coerceTasks(config)).toBe(config);
	});
});
