import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSecretSet = vi.hoisted(() => vi.fn());
const runSecretsSync = vi.hoisted(() => vi.fn());
const runSecretsList = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../secret-set/index.js", () => ({ runSecretSet }));
vi.mock("../secrets-sync/index.js", async (importActual) => ({
	...(await importActual<typeof import("../secrets-sync/index.js")>()),
	runSecretsSync,
	// A layer word names `org/repo - <layer>`; any other text is a literal Environment (the git remote is not read here).
	resolveEnvironmentId: async (id: string) => (["ci", "prod"].includes(id) ? `org/repo - ${id}` : id),
}));
vi.mock("../secrets-list/index.js", async (importActual) => ({
	...(await importActual<typeof import("../secrets-list/index.js")>()),
	runSecretsList,
}));
vi.mock("@theholocron/kyber/prompts", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/prompts")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["name"] ?? argv["environmentId"]],
}));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { listCommand } from "../list/list.command.js";
import { newCommand } from "../new/new.command.js";
import { runCommand } from "../run-command.testing.js";
import { syncCommand } from "../sync/sync.command.js";

const go = (args: string[]) => runCommand(syncCommand, ["sync", ...args]);
const goNew = (args: string[]) => runCommand(newCommand, ["new", ...args]);
const goList = (args: string[]) => runCommand(listCommand, ["list", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSecretSet.mockResolvedValue({ status: "ok" });
	runSecretsSync.mockResolvedValue({ summary: { ok: 2, fail: 0, skip: 0 } });
	runSecretsList.mockResolvedValue({ groups: [], failed: 0 });
});
afterEach(() => void (process.exitCode = undefined));

describe("new secret", () => {
	it("sets the secret in the scope, with the value, --from-stdin or --from-env as given", async () => {
		await goNew(["secret", "TOKEN", "v", "--scope", "env=prod"]);
		expect(runSecretSet.mock.calls[0]![0]).toMatchObject({
			name: "TOKEN",
			value: "v",
			scope: { kind: "environment", name: "prod" },
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
		await goNew(["secret", "TOKEN", "--from-stdin", "--from-env", "MY_TOKEN"]);
		expect(runSecretSet.mock.calls[1]![0]).toMatchObject({
			fromStdin: true,
			fromEnv: "MY_TOKEN",
			scope: { kind: "repo" },
		});
		expect("value" in runSecretSet.mock.calls[1]![0]).toBe(false);
	});

	it("leaves out the value and sources it was not given", async () => {
		await goNew(["secret", "TOKEN"]);
		const input = runSecretSet.mock.calls[0]![0];
		expect(["value", "fromStdin", "fromEnv"].some((k) => k in input)).toBe(false);
	});

	it("exits 1 when it failed, and stops when --token cannot be parsed", async () => {
		runSecretSet.mockResolvedValue({ status: "fail" });
		await goNew(["secret", "TOKEN"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSecretSet.mockClear();
		await goNew(["secret", "TOKEN"]);
		expect(runSecretSet).not.toHaveBeenCalled();
	});
});

describe("sync secrets", () => {
	it("syncs the vault environment to the targets, with the project, worker and GitHub secrets as given", async () => {
		await go([
			"secrets",
			"--env",
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

	it("takes the environment only as --env: the old positional is a usage error, and so is leaving it out", async () => {
		const positional = await go(["secrets", "ci"]).catch((e: unknown) => e);
		expect(String((positional as Error).message ?? positional)).toMatch(/Unknown argument|env/i);
		const missing = await go(["secrets"]).catch((e: unknown) => e);
		expect(String((missing as Error).message ?? missing)).toMatch(/Missing required argument: env/);
		expect(runSecretsSync).not.toHaveBeenCalled();
	});

	it("shows the --env syntax in the refusal of a local or dev sync", async () => {
		const err = await go(["secrets", "--env", "dev"]).catch((e: unknown) => e);
		expect((err as Error).message).toContain("`sync secrets --env dev`");
	});

	it.each(["dev", "local"])(
		"refuses the %s layer whatever else is given, before any config is loaded",
		async (layer) => {
			const err = await go([
				"secrets",
				"--env",
				layer,
				"--github-secret",
				"A",
				"--project-id",
				"p1",
				"--worker",
				"w",
				"--dry-run",
			]).catch((e: unknown) => e);
			expect((err as Error).name).toBe("ConfigError");
			expect((err as Error).message).toContain("never synced");
			expect(loadConfig).not.toHaveBeenCalled();
			expect(runSecretsSync).not.toHaveBeenCalled();
		}
	);

	it("leaves out the project, worker and GitHub secrets it was not given", async () => {
		await go(["secrets", "--env", "prd"]);
		const input = runSecretsSync.mock.calls[0]![0];
		expect(
			["projectId", "workerScript", "githubSecretKeys", "secretRoutes", "githubSecretScope"].some(
				(k) => k in input
			)
		).toBe(false);
	});

	it("takes the routes into GitHub secrets from the repo.secrets.sync entries for that environment", async () => {
		loadConfig.mockResolvedValue({
			resolved: {
				org: "acme",
				repo: {
					secrets: {
						sync: [
							{ environment: "org/repo - ci", keys: ["A"], scope: "org=acme" },
							{ environment: "org/repo - ci", keys: ["B"] },
							{ environment: "other", keys: ["C"] },
						],
					},
				},
			},
			filepath: "/x",
		});
		await go(["secrets", "--env", "ci"]);
		expect(runSecretsSync.mock.calls[0]![0].secretRoutes).toEqual([
			{ scope: { kind: "organization", name: "acme" }, keys: ["A"] },
			{ scope: { kind: "repo" }, keys: ["B"] },
		]);
	});

	it("takes variable routes from repo.variables.sync, and sends no secrets for an environment that is only variables", async () => {
		loadConfig.mockResolvedValue({
			resolved: {
				org: "acme",
				repo: {
					variables: {
						sync: [{ environment: "vars", keys: ["A"], scope: "org=acme" }],
					},
					secrets: { sync: [{ environment: "org/repo - ci", keys: ["S"] }] },
				},
			},
			filepath: "/x",
		});
		await go(["secrets", "--env", "vars"]);
		const input = runSecretsSync.mock.calls[0]![0];
		expect(input.variableRoutes).toEqual([{ scope: { kind: "organization", name: "acme" }, keys: ["A"] }]);
		expect(input.secretRoutes).toEqual([]);

		runSecretsSync.mockClear();
		await go(["secrets", "--env", "ci"]);
		const secretsOnly = runSecretsSync.mock.calls[0]![0];
		expect("variableRoutes" in secretsOnly).toBe(false);
		expect(secretsOnly.secretRoutes).toHaveLength(1);
	});

	it("reads the Environment of a layer word, and a literal name as it is", async () => {
		await go(["secrets", "--env", "prod"]);
		expect(runSecretsSync.mock.calls[0]![0].environmentId).toBe("org/repo - prod");
		runSecretsSync.mockClear();
		await go(["secrets", "--env", "Sentinel"]);
		expect(runSecretsSync.mock.calls[0]![0].environmentId).toBe("Sentinel");
	});

	it("lets --github-secret win over the config entries", async () => {
		loadConfig.mockResolvedValue({
			resolved: { org: "acme", repo: { secrets: { sync: [{ environment: "org/repo - ci", keys: ["A"] }] } } },
			filepath: "/x",
		});
		await go(["secrets", "--env", "ci", "--github-secret", "Z"]);
		const input = runSecretsSync.mock.calls[0]![0];
		expect("secretRoutes" in input).toBe(false);
		expect(input.githubSecretKeys).toEqual(["Z"]);
	});

	it("exits 1 when a secret failed, and stops when --token cannot be parsed", async () => {
		runSecretsSync.mockResolvedValue({ summary: { ok: 0, fail: 1, skip: 0 } });
		await go(["secrets", "--env", "prd"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSecretsSync.mockClear();
		await go(["secrets", "--env", "prd"]);
		expect(runSecretsSync).not.toHaveBeenCalled();
	});
});

describe("list secrets", () => {
	it("lists the repository and the configured organization, as text", async () => {
		await goList(["secrets"]);
		expect(runSecretsList.mock.calls[0]![0]).toMatchObject({
			scopes: [{ kind: "repo" }, { kind: "organization", name: "acme" }],
			json: false,
			context: { repoRoot: "/repo", cliToken: "t", org: "acme", dryRun: false },
		});
	});

	it("passes --scope, --env and --json through", async () => {
		await goList(["secrets", "--scope", "environment", "--env", "production", "--json"]);
		expect(runSecretsList.mock.calls[0]![0]).toMatchObject({
			scopes: [{ kind: "environment", name: "production" }],
			json: true,
		});
	});

	it("lists only the repository when no organization is known", async () => {
		loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
		await goList(["secrets"]);
		expect(runSecretsList.mock.calls[0]![0].scopes).toEqual([{ kind: "repo" }]);
	});

	it("exits 1 when a scope could not be listed, and stops when --token cannot be parsed", async () => {
		runSecretsList.mockResolvedValue({ groups: [], failed: 1 });
		await goList(["secrets"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSecretsList.mockClear();
		await goList(["secrets"]);
		expect(runSecretsList).not.toHaveBeenCalled();
	});
});
