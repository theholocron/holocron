import { describe, expect, it, vi } from "vitest";

import { COMMAND_REGISTRY } from "../../interactive-menu/command-catalog/index.js";
import { COMMAND_CONTEXTS } from "../contexts/contexts.js";
import { DEEP_CHECKS } from "./deep-checks.js";

const runDoctorNotifications = vi.hoisted(() => vi.fn());
vi.mock("../doctor-notifications/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-notifications/index.js")>()),
	runDoctorNotifications,
}));

const runDoctorRepo = vi.hoisted(() => vi.fn());
vi.mock("../doctor-repo/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-repo/index.js")>()),
	runDoctorRepo,
}));

const runDoctorSecrets = vi.hoisted(() => vi.fn());
vi.mock("../doctor-secrets/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-secrets/index.js")>()),
	runDoctorSecrets,
}));

const runDoctorEnvironments = vi.hoisted(() => vi.fn());
vi.mock("../doctor-environments/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-environments/index.js")>()),
	runDoctorEnvironments,
}));

const runDoctorDns = vi.hoisted(() => vi.fn());
vi.mock("../doctor-dns/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-dns/index.js")>()),
	runDoctorDns,
}));

const runDoctorProject = vi.hoisted(() => vi.fn());
vi.mock("../doctor-project/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-project/index.js")>()),
	runDoctorProject,
}));

const runDoctorCi = vi.hoisted(() => vi.fn());
vi.mock("../doctor-ci/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-ci/index.js")>()),
	runDoctorCi,
}));

describe("the project entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const project = DEEP_CHECKS.find((c) => c.name === "project")!;

	it("compares the projects capability and reports the run's status and counts", async () => {
		expect(project.capability).toBe("projects");
		runDoctorProject.mockResolvedValue({ status: "fail", rows: [], summary: { ok: 2, fail: 1, skip: 1 } });
		expect(await project.run(input)).toEqual({ status: "fail", summary: { ok: 2, fail: 1, skip: 1 } });
	});

	it("carries the reason nothing was checked", async () => {
		runDoctorProject.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `projects` provider is configured",
		});
		expect(await project.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `projects` provider is configured",
		});
	});
});

const runDoctorGitHubApp = vi.hoisted(() => vi.fn());
vi.mock("../doctor-github-app/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-github-app/index.js")>()),
	runDoctorGitHubApp,
}));

describe("the github-app entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const app = DEEP_CHECKS.find((c) => c.name === "github-app")!;

	it("compares the vault capability and reports the run's status and counts", async () => {
		expect(app.capability).toBe("vault");
		runDoctorGitHubApp.mockResolvedValue({ status: "fail", rows: [], summary: { ok: 2, fail: 1, skip: 0 } });
		expect(await app.run(input)).toEqual({ status: "fail", summary: { ok: 2, fail: 1, skip: 0 } });
	});

	it("carries the reason nothing was checked", async () => {
		runDoctorGitHubApp.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `githubApps` are declared",
		});
		expect(await app.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `githubApps` are declared",
		});
	});
});

const runDoctorLogs = vi.hoisted(() => vi.fn());
vi.mock("../doctor-logs/index.js", async (importActual) => ({
	...(await importActual<typeof import("../doctor-logs/index.js")>()),
	runDoctorLogs,
}));

describe("the logs entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const logs = DEEP_CHECKS.find((c) => c.name === "logs")!;

	it("compares the logs capability and reports the run's status and counts", async () => {
		expect(logs.capability).toBe("logs");
		runDoctorLogs.mockResolvedValue({ status: "fail", rows: [], summary: { ok: 2, fail: 1, skip: 2 } });
		expect(await logs.run(input)).toEqual({ status: "fail", summary: { ok: 2, fail: 1, skip: 2 } });
	});

	it("carries the reason nothing was checked", async () => {
		runDoctorLogs.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `logs` provider is configured",
		});
		expect(await logs.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no `logs` provider is configured",
		});
	});
});

describe("the ci entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const ci = DEEP_CHECKS.find((c) => c.name === "ci")!;

	it("reports the run's status and counts", async () => {
		runDoctorCi.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 4, fail: 0, skip: 0 } });
		expect(await ci.run(input)).toEqual({ status: "ok", summary: { ok: 4, fail: 0, skip: 0 } });
	});

	it("reports a failure", async () => {
		runDoctorCi.mockResolvedValue({ status: "fail", rows: [], summary: { ok: 2, fail: 1, skip: 1 } });
		expect(await ci.run(input)).toEqual({ status: "fail", summary: { ok: 2, fail: 1, skip: 1 } });
	});
});

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

describe("the dns entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const dns = DEEP_CHECKS.find((c) => c.name === "dns")!;

	it("reports the run's status and counts", async () => {
		runDoctorDns.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await dns.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorDns.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no dns provider",
		});
		expect(await dns.run(input)).toEqual({
			status: "skip",
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no dns provider",
		});
	});
});

describe("the repo entry", () => {
	const input = { loaded: {} as never, context: {} as never };
	const repo = DEEP_CHECKS.find((c) => c.name === "repo")!;

	it("reports the run's status and counts", async () => {
		runDoctorRepo.mockResolvedValue({ status: "ok", rows: [], summary: { ok: 1, fail: 0, skip: 1 } });
		expect(await repo.run(input)).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
	});

	it("carries the reason every row was skipped", async () => {
		runDoctorRepo.mockResolvedValue({
			status: "skip",
			rows: [],
			summary: { ok: 0, fail: 0, skip: 1 },
			reason: "no source provider",
		});
		expect(await repo.run(input)).toEqual({
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
