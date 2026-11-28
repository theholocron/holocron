import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SCHEDULED_TASKS } from "./scheduled-tasks.js";

const vercel = JSON.parse(readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8")) as {
	crons: { path: string; schedule: string }[];
};

const schedule = (task: string) => vercel.crons.find((c) => c.path.endsWith(`task=${task}`))?.schedule;

describe("SCHEDULED_TASKS", () => {
	it("names each task's thin caller", () => {
		for (const [task, { workflow }] of Object.entries(SCHEDULED_TASKS)) {
			expect(workflow).toBe(`ci.${task}.yml`);
		}
	});

	it("lists the four tasks Sentinel starts", () => {
		expect(Object.keys(SCHEDULED_TASKS).sort()).toEqual([
			"check-tokens",
			"reconcile-projects",
			"sync-incidents",
			"sync-specs",
		]);
	});

	it("has one vercel.json cron per task", () => {
		const tasks = vercel.crons.map((c) => new URLSearchParams(c.path.split("?")[1]).get("task"));
		expect([...tasks].sort()).toEqual(Object.keys(SCHEDULED_TASKS).sort());
	});

	it("schedules sync-specs and reconcile-projects hourly and check-tokens daily", () => {
		expect(schedule("sync-specs")).toBe("17 * * * *");
		expect(schedule("reconcile-projects")).toBe("23 * * * *");
		expect(schedule("check-tokens")).toBe("17 6 * * *");
	});
});
