import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveApp = vi.hoisted(() => vi.fn());
const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runAppSync = vi.hoisted(() => vi.fn());
const resolveEnvironmentId = vi.hoisted(() => vi.fn());
vi.mock("../resolve-app/index.js", () => ({ resolveApp }));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../app-sync/index.js", () => ({ runAppSync }));
vi.mock("../secrets-sync/index.js", () => ({ resolveEnvironmentId, runSecretsSync: vi.fn() }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));
vi.mock("../../observability/logger/index.js", () => ({ reportError }));
vi.mock("../../plugin/index.js", () => ({ PluginLoader: class {} }));

import type { GlobalArgs } from "../global-args/index.js";
import type { SyncArgs } from "./sync.args.js";
import { syncApp } from "./sync-app.js";

const sentinel = { name: "sentinel", path: "apps/sentinel", dir: "/r/apps/sentinel" };
const argv = (over: Record<string, unknown> = {}) =>
	({ cwd: "/r", dryRun: false, token: [], ...over }) as unknown as GlobalArgs & SyncArgs;

beforeEach(() => {
	vi.clearAllMocks();
	resolveApp.mockResolvedValue({ repoRoot: "/r", app: sentinel, names: ["council", "sentinel"] });
	loadConfig.mockResolvedValue({ resolved: { org: "acme" } });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runAppSync.mockResolvedValue({ status: "ok", message: "" });
	resolveEnvironmentId.mockResolvedValue("acme/repo - prod");
});
afterEach(() => void (process.exitCode = undefined));

describe("syncApp", () => {
	it("syncs the app the first step names, from its own folder", async () => {
		expect(await syncApp(argv({ steps: ["sentinel"], env: "prod" }))).toBe(true);
		expect(resolveApp).toHaveBeenCalledWith("sentinel", "/r");
		const input = runAppSync.mock.calls[0]![0];
		expect(input).toMatchObject({ app: sentinel, env: { layer: "prod", targets: ["production"] } });
		const loaded = await input.load();
		expect(loadConfig).toHaveBeenCalledWith("/r/apps/sentinel");
		expect(loaded.context).toMatchObject({
			repoRoot: "/r/apps/sentinel",
			dryRun: false,
			cliToken: "t",
			org: "acme",
		});
		expect(await input.resolveEnvironment("prod")).toBe("acme/repo - prod");
		expect(resolveEnvironmentId).toHaveBeenCalledWith("prod", { repoRoot: "/r/apps/sentinel" });
		expect(process.exitCode).toBeUndefined();
	});

	it("finds the app from the working folder when there is no step, or the step is a sync step", async () => {
		await syncApp(argv({ env: ["production", "preview"] }));
		expect(resolveApp).toHaveBeenLastCalledWith(undefined, "/r");
		await syncApp(argv({ steps: ["labels"], env: "prod" }));
		expect(resolveApp).toHaveBeenLastCalledWith(undefined, "/r");
		expect(runAppSync.mock.calls[0]![0].env.targets).toEqual(["production", "preview"]);
	});

	it("does not handle a value that is no app when --env is not given", async () => {
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: ["sentinel"] });
		expect(await syncApp(argv({ steps: ["labels"] }))).toBe(false);
		expect(await syncApp(argv({ steps: ["nonsense"] }))).toBe(false);
		expect(runAppSync).not.toHaveBeenCalled();
		expect(reportError).not.toHaveBeenCalled();
	});

	it("names the apps there are when --env names none, and asks for a name outside an app", async () => {
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: ["council", "sentinel"] });
		expect(await syncApp(argv({ steps: ["nope"], env: "prod" }))).toBe(true);
		expect(reportError).toHaveBeenCalledWith(
			'sync: no app named "nope" in this workspace (apps: council, sentinel)'
		);
		expect(process.exitCode).toBe(1);
		resolveApp.mockResolvedValue({ repoRoot: "/r", names: [] });
		await syncApp(argv({ env: "prod" }));
		expect(reportError).toHaveBeenCalledWith("sync: name an app, or run it from inside one (apps: none found)");
	});

	it("refuses an --env that is not an environment of an app, and asks for --env when only a name was given", async () => {
		await syncApp(argv({ steps: ["sentinel"], env: "ci" }));
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("--env ci is not an environment"));
		await syncApp(argv({ steps: ["sentinel"] }));
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("pass --env production or --env preview"));
		expect(runAppSync).not.toHaveBeenCalled();
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		expect(await syncApp(argv({ steps: ["sentinel"], env: "prod" }))).toBe(true);
		expect(runAppSync).not.toHaveBeenCalled();
	});

	it("exits 1 when the sync failed", async () => {
		runAppSync.mockResolvedValue({ status: "fail", message: "x" });
		await syncApp(argv({ steps: ["sentinel"], env: "prod" }));
		expect(process.exitCode).toBe(1);
	});
});
