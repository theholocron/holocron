import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSecretSet = vi.hoisted(() => vi.fn());
const runSecretsSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../secret-set/index.js", () => ({ runSecretSet }));
vi.mock("../secrets-sync/index.js", () => ({ runSecretsSync }));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["name"] ?? argv["environmentId"]],
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { runCommand } from "../../testing/run-command.js";
import { secretsCommand } from "./secrets.command.js";

const go = (args: string[]) => runCommand(secretsCommand, ["secrets", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSecretSet.mockResolvedValue({ status: "ok" });
	runSecretsSync.mockResolvedValue({ summary: { ok: 2, fail: 0, skip: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("secrets set", () => {
	it("sets the secret in the scope, with the value, --from-stdin or --from-env as given", async () => {
		await go(["set", "TOKEN", "v", "--scope", "env=prod"]);
		expect(runSecretSet.mock.calls[0]![0]).toMatchObject({
			name: "TOKEN",
			value: "v",
			scope: { kind: "environment", name: "prod" },
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
		await go(["set", "TOKEN", "--from-stdin", "--from-env", "MY_TOKEN"]);
		expect(runSecretSet.mock.calls[1]![0]).toMatchObject({
			fromStdin: true,
			fromEnv: "MY_TOKEN",
			scope: { kind: "repo" },
		});
		expect("value" in runSecretSet.mock.calls[1]![0]).toBe(false);
	});

	it("leaves out the value and sources it was not given", async () => {
		await go(["set", "TOKEN"]);
		const input = runSecretSet.mock.calls[0]![0];
		expect(["value", "fromStdin", "fromEnv"].some((k) => k in input)).toBe(false);
	});

	it("exits 1 when it failed, and stops when --token cannot be parsed", async () => {
		runSecretSet.mockResolvedValue({ status: "fail" });
		await go(["set", "TOKEN"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSecretSet.mockClear();
		await go(["set", "TOKEN"]);
		expect(runSecretSet).not.toHaveBeenCalled();
	});
});

describe("secrets sync", () => {
	it("syncs the vault environment to the targets, with the project, worker and GitHub secrets as given", async () => {
		await go([
			"sync",
			"prd",
			"--project-id",
			"p1",
			"--worker",
			"comlink",
			"--github-secret",
			"A",
			"--github-secret",
			"B",
			"--github-secret-scope",
			"org=acme",
			"--target",
			"production",
		]);
		expect(runSecretsSync.mock.calls[0]![0]).toMatchObject({
			environmentId: "prd",
			projectId: "p1",
			workerScript: "comlink",
			githubSecretKeys: ["A", "B"],
			githubSecretScope: { kind: "organization", name: "acme" },
			targets: ["production"],
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
	});

	it("leaves out the project, worker and GitHub secrets it was not given", async () => {
		await go(["sync", "prd"]);
		const input = runSecretsSync.mock.calls[0]![0];
		expect(["projectId", "workerScript", "githubSecretKeys"].some((k) => k in input)).toBe(false);
		expect(input.githubSecretScope).toEqual({ kind: "repo" });
	});

	it("exits 1 when a secret failed, and stops when --token cannot be parsed", async () => {
		runSecretsSync.mockResolvedValue({ summary: { ok: 0, fail: 1, skip: 0 } });
		await go(["sync", "prd"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSecretsSync.mockClear();
		await go(["sync", "prd"]);
		expect(runSecretsSync).not.toHaveBeenCalled();
	});
});

describe("secrets", () => {
	it("a bare `secrets` opens the menu of its subcommands", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"secrets — choose a subcommand:",
			expect.any(String),
			["secrets"]
		);
	});
});
