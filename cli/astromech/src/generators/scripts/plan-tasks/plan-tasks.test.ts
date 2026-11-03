import { describe, expect, it } from "vitest";

import { TASKS } from "../../../registry/index.js";
import { planTasks } from "./plan-tasks.js";

describe("planTasks", () => {
	it("classifies a task by how a turbo repo reaches it", () => {
		const kinds = Object.fromEntries(
			planTasks({ tasks: ["build", "lint:markdown", "validate", "lint:commits"] }, TASKS).map((t) => [
				t.id,
				t.kind,
			])
		);
		expect(kinds).toEqual({
			build: "turbo",
			"lint:markdown": "tool",
			"validate:specs": "cli",
			"validate:docs": "cli",
			"lint:commits": "cli",
		});
	});

	it("carries the key of the entry's spelling, the script name and the command of a tool leaf", () => {
		const [old] = planTasks({ tasks: ["verification.unitTests"] }, TASKS);
		expect(old).toMatchObject({ entry: "verification.unitTests", id: "test:unit", script: "test:unit" });
		expect(old!.key).toBe("verification.unitTests");
		const [format] = planTasks({ tasks: ["format"] }, TASKS);
		expect(format).toMatchObject({ key: "format", kind: "tool", command: "prettier --write ." });
	});

	it("expands an old name that stood for several tasks, in run order", () => {
		const ids = planTasks({ tasks: ["sourceQuality.formatting"] }, TASKS).map((t) => t.id);
		expect(ids).toEqual(["lint:editorconfig", "lint:markdown", "format"]);
	});

	it("lists a task once, however many entries name it", () => {
		expect(planTasks({ tasks: ["build", { name: "delivery.build", with: {} }] }, TASKS)).toHaveLength(1);
	});

	it("skips a task with no local equivalent, one switched off for local runs and an id the registry lacks", () => {
		const planned = planTasks(
			{ tasks: ["scan:code", "deploy", { name: "typecheck", local: false }, "label", "release"] },
			TASKS
		);
		expect(planned).toEqual([]);
	});

	it("uses the registry it is given", () => {
		const planned = planTasks(
			{ tasks: ["build"] },
			{ build: { group: "Delivery", scope: "package", local: { tool: "x" } } }
		);
		expect(planned).toMatchObject([{ id: "build", kind: "tool", command: "x" }]);
	});
});
