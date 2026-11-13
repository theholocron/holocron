import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorSecrets = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-secrets.js", () => ({ runDoctorSecrets }));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../run-command.testing.js";
import { doctorSecretsCommand } from "./doctor-secrets.command.js";

const run = (extra: Record<string, unknown> = {}) =>
	(doctorSecretsCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...extra } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorSecrets.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor secrets command", () => {
	it("runs the check with the loaded config and the resolved org", async () => {
		await run();
		expect(runDoctorSecrets.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
			strict: false,
		});
		expect("environments" in runDoctorSecrets.mock.calls[0]![0]).toBe(false);
		expect(process.exitCode).toBeUndefined();
	});

	it("passes the environments of --env, a list and repeated values alike, in the canonical order", async () => {
		await run({ env: ["prod,local", "prod"] });
		expect(runDoctorSecrets.mock.calls[0]![0].environments).toEqual(["local", "prod"]);
	});

	it("passes --only-secrets, --only-variables, --strict and --name through a real parse", async () => {
		await runCommand(doctorSecretsCommand, ["secrets", "--only-secrets", "--strict", "--name", "TOKEN"]);
		expect(runDoctorSecrets.mock.calls[0]![0]).toMatchObject({ only: "secrets", strict: true, name: "TOKEN" });
		await runCommand(doctorSecretsCommand, ["secrets", "--only-variables", "--env", "ci", "prod"]);
		expect(runDoctorSecrets.mock.calls[1]![0]).toMatchObject({ only: "variables", environments: ["ci", "prod"] });
		await runCommand(doctorSecretsCommand, ["secrets"]);
		expect("only" in runDoctorSecrets.mock.calls[2]![0]).toBe(false);
		expect("verify" in runDoctorSecrets.mock.calls[2]![0]).toBe(false);
		await runCommand(doctorSecretsCommand, ["secrets", "--verify"]);
		expect(runDoctorSecrets.mock.calls[3]![0]).toMatchObject({ verify: true });
		expect("name" in runDoctorSecrets.mock.calls[2]![0]).toBe(false);
	});

	it("refuses --only-secrets together with --only-variables", async () => {
		const err = await runCommand(doctorSecretsCommand, ["secrets", "--only-secrets", "--only-variables"]).catch(
			(e: unknown) => e
		);
		expect(String((err as Error).message ?? err)).toMatch(/only-secrets|mutually exclusive|Arguments/i);
		expect(runDoctorSecrets).not.toHaveBeenCalled();
	});

	it("rejects an unknown --env name before it reads anything", async () => {
		const err = await run({ env: ["staging"] }).catch((e: unknown) => e);
		expect((err as Error).message).toContain("local, dev, ci, test, prod");
		expect(loadConfig).not.toHaveBeenCalled();
		expect(runDoctorSecrets).not.toHaveBeenCalled();
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorSecrets.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorSecrets.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctorSecrets).not.toHaveBeenCalled();
	});

	it("is the `secrets` subcommand", () => {
		expect(doctorSecretsCommand.command).toBe("secrets");
	});
});
