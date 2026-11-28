import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveApp = vi.hoisted(() => vi.fn());
const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runAppDeploy = vi.hoisted(() => vi.fn());
vi.mock("../resolve-app/index.js", () => ({ resolveApp }));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../app-deploy/index.js", () => ({ runAppDeploy }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));
vi.mock("../../observability/logger/index.js", () => ({ reportError }));
vi.mock("../../plugin/index.js", () => ({ PluginLoader: class {} }));

import type { GlobalArgs } from "../global-args/index.js";
import type { DeployArgs } from "./deploy.args.js";
import { deployApp } from "./deploy-app.js";

const sentinel = { name: "sentinel", path: "apps/sentinel", dir: "/r/apps/sentinel" };
const argv = (over: Record<string, unknown> = {}) =>
	({ cwd: "/r", dryRun: false, token: [], ...over }) as unknown as GlobalArgs & DeployArgs;

beforeEach(() => {
	vi.clearAllMocks();
	resolveApp.mockResolvedValue({ repoRoot: "/r", app: sentinel, names: ["council", "sentinel"] });
	loadConfig.mockResolvedValue({ resolved: { org: "acme" } });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runAppDeploy.mockResolvedValue({ status: "ok", message: "" });
});
afterEach(() => void (process.exitCode = undefined));

describe("deployApp", () => {
	it("deploys the app the branch positional names, from its own folder", async () => {
		expect(await deployApp(argv({ branch: "sentinel", env: "prod" }))).toBe(true);
		expect(resolveApp).toHaveBeenCalledWith("sentinel", "/r");
		const input = runAppDeploy.mock.calls[0]![0];
		expect(input).toMatchObject({ app: sentinel, env: { targets: ["production"] } });
		const loaded = await input.load();
		expect(loadConfig).toHaveBeenCalledWith("/r/apps/sentinel");
		expect(loaded.context).toMatchObject({
			repoRoot: "/r/apps/sentinel",
			dryRun: false,
			cliToken: "t",
			org: "acme",
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("finds the app from the working folder when no name is given", async () => {
		await deployApp(argv({ env: ["production", "preview"] }));
		expect(resolveApp).toHaveBeenCalledWith(undefined, "/r");
		expect(runAppDeploy.mock.calls[0]![0].env.targets).toEqual(["production", "preview"]);
	});

	it("does not handle a value that is no app when --env is not given", async () => {
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: ["sentinel"] });
		expect(await deployApp(argv({ branch: "main" }))).toBe(false);
		expect(runAppDeploy).not.toHaveBeenCalled();
		expect(reportError).not.toHaveBeenCalled();
	});

	it("names the apps there are when --env names none", async () => {
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: ["council", "sentinel"] });
		expect(await deployApp(argv({ branch: "nope", env: "prod" }))).toBe(true);
		expect(reportError).toHaveBeenCalledWith(
			'deploy: no app named "nope" in this workspace (apps: council, sentinel)'
		);
		expect(process.exitCode).toBe(1);
	});

	it("asks for a name when run outside an app, and says when there are no apps", async () => {
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: [] });
		await deployApp(argv({ env: "prod" }));
		expect(reportError).toHaveBeenCalledWith("deploy: name an app, or run it from inside one (apps: none found)");
	});

	it("refuses an --env that is not an environment of an app", async () => {
		expect(await deployApp(argv({ branch: "sentinel", env: "dev" }))).toBe(true);
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("--env dev is not an environment"));
		expect(process.exitCode).toBe(1);
		expect(runAppDeploy).not.toHaveBeenCalled();
	});

	it("asks for --env when only an app's name was given", async () => {
		await deployApp(argv({ branch: "sentinel" }));
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("pass --env production or --env preview"));
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		expect(await deployApp(argv({ branch: "sentinel", env: "prod" }))).toBe(true);
		expect(runAppDeploy).not.toHaveBeenCalled();
	});

	it("exits 1 when the deploy failed", async () => {
		runAppDeploy.mockResolvedValue({ status: "fail", message: "x" });
		await deployApp(argv({ branch: "sentinel", env: "prod" }));
		expect(process.exitCode).toBe(1);
	});
});
