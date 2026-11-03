import { describe, expect, it } from "vitest";

import { TASKS } from "../../../registry/index.js";
import { planTasks } from "../plan-tasks/index.js";
import { planSuites } from "./plan-suites.js";

describe("planSuites", () => {
	it("lists the planned leaves of each suite in registry order, whatever the manifest order", () => {
		const planned = planTasks({ tasks: ["lint:markdown", "test:unit", "lint:code", "build"] }, TASKS);
		const suites = planSuites(planned, TASKS);
		expect([...suites.keys()]).toEqual(["test", "lint"]);
		expect(suites.get("lint")!.map((leaf) => leaf.id)).toEqual(["lint:code", "lint:markdown"]);
	});

	it("leaves out a leaf with no script and a suite left empty by that", () => {
		const planned = planTasks({ tasks: ["lint:commits", "scan:code", "test:unit"] }, TASKS);
		expect([...planSuites(planned, TASKS).keys()]).toEqual(["test"]);
	});
});
