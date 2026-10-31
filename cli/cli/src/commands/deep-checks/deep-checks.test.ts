import { describe, expect, it, vi } from "vitest";

import { COMMAND_REGISTRY } from "../../interactive-menu/command-registry/command-registry.js";
import { COMMAND_CONTEXTS } from "../contexts/contexts.js";
import { DEEP_CHECKS } from "./deep-checks.js";

const runDoctorNotifications = vi.hoisted(() => vi.fn());
vi.mock("../doctor-notifications/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-notifications/index.js")>()),
	runDoctorNotifications,
}));

const runDoctorSecrets = vi.hoisted(() => vi.fn());
vi.mock("../doctor-secrets/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-secrets/index.js")>()),
	runDoctorSecrets,
}));

const runDoctorTokens = vi.hoisted(() => vi.fn());
vi.mock("../doctor-tokens/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-tokens/index.js")>()),
	runDoctorTokens,
}));

const runDoctorEnvironments = vi.hoisted(() => vi.fn());
vi.mock("../doctor-environments/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-environments/index.js")>()),
	runDoctorEnvironments,
}));

const runDoctorVariables = vi.hoisted(() => vi.fn());
vi.mock("../doctor-variables/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-variables/index.js")>()),
	runDoctorVariables,
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

const runDoctorMonitoring = vi.hoisted(() => vi.fn());
vi.mock("../doctor-monitoring/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-monitoring/index.js")>()),
	runDoctorMonitoring,
}));

describe("the monitoring entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const monitoring = DEEP_CHECKS.find((c) => c.name === "monitoring")!;

	it("reports the run's status and counts", async () => {
		runDoctorMonitoring.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 0 } });
		expect(await monitoring.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 0 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorMonitoring.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "provider does not implement listChecks",
		});
		expect(await monitoring.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "provider does not implement listChecks",
		});
	});
});

describe("the secrets entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const secrets = DEEP_CHECKS.find((c) => c.name === "secrets")!;

	it("reports the run's status and counts", async () => {
		runDoctorSecrets.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await secrets.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorSecrets.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no secrets provider",
		});
		expect(await secrets.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no secrets provider",
		});
	});
});

describe("the tokens entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const tokens = DEEP_CHECKS.find((c) => c.name === "tokens")!;

	it("reports the run's status and counts", async () => {
		runDoctorTokens.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await tokens.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorTokens.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no plugin lists tokens",
		});
		expect(await tokens.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no plugin lists tokens",
		});
	});
});

describe("the environments entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const environments = DEEP_CHECKS.find((c) => c.name === "environments")!;

	it("reports the run's status and counts", async () => {
		runDoctorEnvironments.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await environments.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorEnvironments.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no environments provider",
		});
		expect(await environments.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no environments provider",
		});
	});
});

describe("the variables entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const variables = DEEP_CHECKS.find((c) => c.name === "variables")!;

	it("reports the run's status and counts", async () => {
		runDoctorVariables.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await variables.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorVariables.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no source provider",
		});
		expect(await variables.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no source provider",
		});
	});
});

describe("the notifications entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const notifications = DEEP_CHECKS.find((c) => c.name === "notifications")!;

	it("reports the run's status and counts, naming pass as ok", async () => {
		runDoctorNotifications.mockResolvedValue({ status: "ok", checks: [], summary: { pass: 3, fail: 0, skip: 1 } });
		expect(await notifications.run(input)).toEqual({ status: "ok", summary: { ok: 3, fail: 0, skip: 1 } });
	});

	it("runs without posting anything", async () => {
		runDoctorNotifications.mockResolvedValue({ status: "ok", checks: [], summary: { pass: 1, fail: 0, skip: 0 } });
		await notifications.run(input);
		expect(runDoctorNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ builtOnly: true }));
	});

	it("is a skip, with the reason, when the run could not verify anything", async () => {
		runDoctorNotifications.mockResolvedValue({
			status: "fail",
			checks: [],
			summary: { pass: 0, fail: 1, skip: 0 },
			message: "no notifications provider configured",
		});
		expect(await notifications.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no notifications provider configured",
		});
	});
});
