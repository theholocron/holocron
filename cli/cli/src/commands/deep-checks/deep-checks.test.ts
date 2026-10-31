import { describe, expect, it, vi } from "vitest";

import { COMMAND_REGISTRY } from "../../interactive-menu/command-registry/command-registry.js";
import { COMMAND_CONTEXTS } from "../contexts/contexts.js";
import { DEEP_CHECKS } from "./deep-checks.js";

const runDoctorNotifications = vi.hoisted(() => vi.fn());
vi.mock("../doctor-notifications/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-notifications/index.js")>()),
	runDoctorNotifications,
}));

describe("DEEP_CHECKS", () => {
	it("has a unique name per check", () => {
		const names = DEEP_CHECKS.map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it.each(DEEP_CHECKS.map((c) => c.name))(
		"`doctor %s` has a COMMAND_CONTEXTS and a COMMAND_REGISTRY entry",
		(name) => {
			expect(Object.keys(COMMAND_CONTEXTS)).toContain(`doctor ${name}`);
			expect(COMMAND_REGISTRY.map((e) => e.name)).toContain(`doctor ${name}`);
		}
	);

	it.each(DEEP_CHECKS.map((c) => c.name))("`doctor %s` registers a subcommand named after it", (name) => {
		const check = DEEP_CHECKS.find((c) => c.name === name)!;
		expect(String(check.command.command)).toMatch(new RegExp(`^${name}\\b`));
	});
});

describe("the notifications entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const notifications = DEEP_CHECKS.find((c) => c.name === "notifications")!;

	it("reports the run's status and counts, naming pass as ok", async () => {
		runDoctorNotifications.mockResolvedValue({ status: "ok", checks: [], summary: { pass: 3, fail: 0, skip: 1 } });
		expect(await notifications.run(input)).toEqual({ status: "ok", summary: { ok: 3, fail: 0, skip: 1 } });
	});

	it("carries the reason a run could not verify anything", async () => {
		runDoctorNotifications.mockResolvedValue({
			status: "fail",
			checks: [],
			summary: { pass: 0, fail: 1, skip: 0 },
			message: "no notifications provider configured",
		});
		expect(await notifications.run(input)).toEqual({
			status: "fail",
			summary: { ok: 0, fail: 1, skip: 0 },
			reason: "no notifications provider configured",
		});
	});
});
