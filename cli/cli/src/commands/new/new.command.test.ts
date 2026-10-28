import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runNew = vi.hoisted(() => vi.fn());
const ask = vi.hoisted(() => vi.fn());
const runPluginCreate = vi.hoisted(() => vi.fn());
const resolvePluginCreateInputs = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const select = vi.hoisted(() => vi.fn());
const input = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ select, input }));
vi.mock("./new-repo-wizard.js", () => ({ askNewRepoAnswers: ask }));
vi.mock("./index.js", async (importActual) => ({ ...(await importActual<typeof import("./index.js")>()), runNew }));
vi.mock("../plugin-create/index.js", async (importActual) => ({
	...(await importActual<typeof import("../plugin-create/index.js")>()),
	runPluginCreate,
	resolvePluginCreateInputs,
}));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["slug"], argv["vendor"]],
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { runCommand } from "../../testing/run-command.js";
import { PluginCreateError } from "../plugin-create/index.js";
import { NewError } from "./index.js";
import { newCommand } from "./new.command.js";

const go = (args: string[]) => runCommand(newCommand, ["new", ...args]);
const answers = (over: Record<string, unknown> = {}) => ({
	type: "node",
	name: "lib",
	description: "",
	homepage: undefined,
	vaultProvider: "doppler",
	vaultProject: "p",
	vaultConfig: "c",
	deploymentProvider: "vercel",
	agent: "claude",
	runtimeEnvironment: "universal",
	topics: ["t"],
	protection: "balanced",
	openSource: false,
	usesExternalPackages: false,
	skills: ["s"],
	isTemplate: true,
	...over,
});

beforeEach(() => {
	vi.clearAllMocks();
	tokenContext.mockReturnValue({ cliToken: "t" });
	ask.mockResolvedValue(answers());
	runNew.mockResolvedValue({ status: "ok" });
	resolvePluginCreateInputs.mockResolvedValue({
		capability: "vault",
		vendorEnv: "ACME_KEY",
		baseUrl: "https://api.acme.test",
	});
	runPluginCreate.mockReturnValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("new repo", () => {
	it("scaffolds the repo from the answers, with the admin token, the org and the flags", async () => {
		await go(["repo", "node", "lib", "--org", "acme", "--dry-run", "--no-verify"]);
		expect(runNew).toHaveBeenCalledWith({
			type: "node",
			name: "lib",
			description: undefined,
			homepage: undefined,
			vaultProvider: "doppler",
			vaultProject: "p",
			vaultConfig: "c",
			deploymentProvider: "vercel",
			agent: "claude",
			runtimeEnvironment: "universal",
			protection: "balanced",
			openSource: false,
			usesExternalPackages: false,
			topics: ["t"],
			skills: ["s"],
			isTemplate: true,
			org: "acme",
			token: "t",
			dryRun: true,
			noVerify: true,
			cwd: "/repo",
		});
	});

	it("uses the github token by name, and fills in the defaults for an answer that is missing", async () => {
		tokenContext.mockReturnValue({ cliToken: "bare", cliTokens: { github: "named" } });
		ask.mockResolvedValue(
			answers({
				vaultProvider: undefined,
				deploymentProvider: undefined,
				agent: undefined,
				runtimeEnvironment: undefined,
				protection: undefined,
				openSource: undefined,
				usesExternalPackages: undefined,
				description: "d",
			})
		);
		await go(["repo"]);
		expect(runNew.mock.calls[0]![0]).toMatchObject({
			token: "named",
			description: "d",
			vaultProvider: "none",
			deploymentProvider: "none",
			agent: "claude",
			runtimeEnvironment: "node",
			protection: "strict",
			openSource: true,
			usesExternalPackages: true,
			noVerify: false,
		});
	});

	it("says a template type and a name are required, and exits 1", async () => {
		ask.mockResolvedValue(answers({ type: undefined }));
		await go(["repo"]);
		expect(reportError).toHaveBeenCalledWith("new: template type is required");
		ask.mockResolvedValue(answers({ name: undefined }));
		await go(["repo"]);
		expect(reportError).toHaveBeenLastCalledWith("new: repo name is required");
		expect(runNew).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("exits 1 when scaffolding failed, reports a NewError, and lets anything else through", async () => {
		runNew.mockResolvedValue({ status: "fail" });
		await go(["repo"]);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runNew.mockRejectedValue(new NewError("template not found"));
		await go(["repo"]);
		expect(reportError).toHaveBeenCalledWith("new: template not found");
		expect(process.exitCode).toBe(1);
		runNew.mockRejectedValue(new Error("boom"));
		await expect(go(["repo"])).rejects.toThrow("boom");
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go(["repo"]);
		expect(ask).not.toHaveBeenCalled();
	});
});

describe("new plugin", () => {
	it("scaffolds the plugin from the slug, the vendor and the resolved inputs", async () => {
		await go(["plugin", "acme", "Acme", "--capability", "vault", "--token-env", "ACME_TOKEN", "--dry-run"]);
		expect(runPluginCreate).toHaveBeenCalledWith({
			slug: "acme",
			vendorName: "Acme",
			capability: "vault",
			vendorEnv: "ACME_KEY",
			baseUrl: "https://api.acme.test",
			tokenEnv: "ACME_TOKEN",
			dryRun: true,
			noVerify: false,
			cwd: "/repo",
		});
	});

	it("leaves out --token-env when not given, and exits 1 when it failed", async () => {
		runPluginCreate.mockReturnValue({ status: "fail" });
		await go(["plugin", "acme", "Acme", "--no-verify"]);
		expect("tokenEnv" in runPluginCreate.mock.calls[0]![0]).toBe(false);
		expect(runPluginCreate.mock.calls[0]![0].noVerify).toBe(true);
		expect(process.exitCode).toBe(1);
	});

	it("asks for the capability, the vendor's env var and its base URL when they were not given", async () => {
		select.mockResolvedValue("vault");
		input.mockResolvedValue("answer");
		resolvePluginCreateInputs.mockImplementation(
			async (_given: unknown, ask: Record<string, () => Promise<string>>) => ({
				capability: await ask["selectCapability"]!(),
				vendorEnv: await ask["inputVendorEnv"]!(),
				baseUrl: await ask["inputBaseUrl"]!(),
			})
		);
		await go(["plugin", "acme", "Acme"]);
		expect(select.mock.calls[0]![0].message).toBe("Capability:");
		expect(select.mock.calls[0]![0].choices.length).toBeGreaterThan(5);
		expect(input.mock.calls.map((c) => c[0].message)).toEqual([
			"Vendor-native env var for the Acme token (e.g. MYVENDOR_API_KEY):",
			"REST base URL for the Acme API (e.g. https://api.myvendor.com):",
		]);
	});

	it("reports a PluginCreateError, and lets anything else through", async () => {
		resolvePluginCreateInputs.mockRejectedValue(new PluginCreateError("slug taken"));
		await go(["plugin", "acme", "Acme"]);
		expect(reportError).toHaveBeenCalledWith("plugin create: slug taken");
		expect(process.exitCode).toBe(1);
		resolvePluginCreateInputs.mockRejectedValue(new Error("boom"));
		await expect(go(["plugin", "acme", "Acme"])).rejects.toThrow("boom");
	});
});

describe("new", () => {
	it("a bare `new` opens the menu of its subcommands", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"new — choose a subcommand:",
			expect.any(String),
			["new"]
		);
	});
});
