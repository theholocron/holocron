import { describe, expect, it, vi } from "vitest";

import type { LoadedConfig, ResolvedHolocronConfig, ResolvedTuple } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AppEnv } from "../app-env/index.js";
import type { WorkspaceApp } from "../resolve-app/index.js";
import { runAppSync } from "./app-sync.js";
import type { RunAppSyncInput } from "./app-sync.type.js";

const tuple = (provider: string, options: Record<string, unknown> = {}): ResolvedTuple => ({
	provider,
	packageName: `p-${provider}`,
	options,
});
const ENV = "acme/repo - prod";
const deploy = [{ environment: ENV, prefix: "SENTINEL_" }];
const sentinelConfig = {
	providers: { deployment: { cardinality: "single", tuple: tuple("vercel", { domain: "sentinel.example" }) } },
	repo: { secrets: { deploy } },
} as unknown as ResolvedHolocronConfig;
const comlinkConfig = {
	providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } },
	repo: { secrets: { deploy: [{ environment: ENV, prefix: "COMLINK_" }] } },
} as unknown as ResolvedHolocronConfig;
const app = (name: string, config?: ResolvedHolocronConfig, over: Partial<WorkspaceApp> = {}): WorkspaceApp => ({
	name,
	path: `apps/${name}`,
	dir: `/r/apps/${name}`,
	...(config ? { config } : {}),
	...over,
});
const production: AppEnv = { targets: ["production"] };
const everything: AppEnv = { targets: ["production", "preview"] };

/** Fakes for every seam; `run()` calls `runAppSync` with them, `over` replacing any. */
function setup({
	resolved = sentinelConfig,
	domains = ["sentinel.example"],
	hasDeployment = true,
	dryRun = false,
} = {}) {
	const deployment = { providerName: "vercel", listDomains: vi.fn(async () => domains) };
	const loader = {
		load: vi.fn(async () => {}),
		has: vi.fn(() => hasDeployment),
		get: vi.fn(() => deployment),
	} as unknown as PluginLoader;
	const load = vi.fn(async () => ({
		loaded: { resolved } as unknown as LoadedConfig,
		context: { repoRoot: "/r/apps/x", dryRun } as RuntimeContext,
		loader,
	}));
	const fakes = {
		load,
		print: vi.fn(),
		resolveEnvironment: vi.fn(async () => ENV),
		syncSecrets: vi.fn(async (_input: object) => ({
			rows: [],
			summary: { ok: 3, fail: 0, skip: 1, dryRun: 0 },
		})),
	};
	const run = (a: WorkspaceApp, over: Partial<RunAppSyncInput> = {}, env = production) =>
		runAppSync({ app: a, env, ...fakes, ...over } as RunAppSyncInput);
	return { ...fakes, loader, deployment, run };
}

describe("runAppSync", () => {
	it("sends an app with a deployment to the project named for it, for production", async () => {
		const s = setup();
		const report = await s.run(app("sentinel", sentinelConfig));
		expect(report).toEqual({ status: "ok", message: "sentinel synced (3 written, 1 skipped)" });
		expect(s.resolveEnvironment).toHaveBeenCalledWith("prod");
		expect(s.deployment.listDomains).toHaveBeenCalledWith("sentinel");
		const call = s.syncSecrets.mock.calls[0]![0] as Record<string, unknown>;
		expect(call).toMatchObject({
			environmentId: ENV,
			projectId: "sentinel",
			targets: ["production"],
			deployFilter: { keys: [], prefixes: ["SENTINEL_"] },
		});
		expect(call).not.toHaveProperty("workerScript");
		expect(call).not.toHaveProperty("secretRoutes");
	});

	it("syncs production from the prod layer and preview from its own, one run each", async () => {
		const both = {
			providers: sentinelConfig.providers,
			repo: {
				secrets: {
					deploy: [
						{ environment: "acme/repo - prod", prefix: "SENTINEL_" },
						{ environment: "acme/repo - preview", prefix: "SENTINEL_", keys: ["ONLY_PREVIEW"] },
					],
				},
			},
		} as unknown as ResolvedHolocronConfig;
		const s = setup({ resolved: both });
		const report = await s.run(
			app("sentinel", both),
			{ resolveEnvironment: vi.fn(async (layer: string) => `acme/repo - ${layer}`) },
			everything
		);
		expect(report.status).toBe("ok");
		expect(s.syncSecrets).toHaveBeenCalledTimes(2);
		expect(s.syncSecrets.mock.calls[0]![0]).toMatchObject({
			environmentId: "acme/repo - prod",
			targets: ["production"],
			deployFilter: { keys: [], prefixes: ["SENTINEL_"] },
		});
		expect(s.syncSecrets.mock.calls[1]![0]).toMatchObject({
			environmentId: "acme/repo - preview",
			targets: ["preview"],
			deployFilter: { keys: ["ONLY_PREVIEW"] },
		});
	});

	it("gives preview no filter, so the sync stops, when the config has no deploy entry for the preview layer", async () => {
		const s = setup();
		await s.run(
			app("sentinel", sentinelConfig),
			{ resolveEnvironment: vi.fn(async (layer: string) => `acme/repo - ${layer}`) },
			{ targets: ["preview"] }
		);
		expect(s.syncSecrets.mock.calls[0]![0]).not.toHaveProperty("deployFilter");
	});

	it("fails naming the target that did not sync, and still tries the other", async () => {
		const s = setup();
		s.syncSecrets.mockResolvedValueOnce({ rows: [], summary: { ok: 1, fail: 2, skip: 0, dryRun: 0 } });
		const report = await s.run(app("sentinel", sentinelConfig), {}, everything);
		expect(report).toEqual({ status: "fail", message: "sentinel: production: 2 secret(s) did not sync" });
		expect(s.syncSecrets).toHaveBeenCalledTimes(2);
	});

	it("sends an app with Workers to the Worker script named for it, without a project", async () => {
		const s = setup({ resolved: comlinkConfig });
		await s.run(app("comlink", comlinkConfig));
		const call = s.syncSecrets.mock.calls[0]![0] as Record<string, unknown>;
		expect(call).toMatchObject({ workerScript: "comlink", deployFilter: { prefixes: ["COMLINK_"] } });
		expect(call).not.toHaveProperty("projectId");
		expect(s.deployment.listDomains).not.toHaveBeenCalled();
	});

	it("passes the secret and variable routes of the app's config, and no filter without an entry", async () => {
		const withRoutes = {
			providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } },
			repo: {
				secrets: {
					deploy: [{ environment: ENV, keys: ["A"] }],
					sync: [{ environment: ENV, scope: "repo", keys: ["A"] }],
				},
				variables: { sync: [{ environment: ENV, scope: "repo", keys: ["V"] }] },
			},
		} as unknown as ResolvedHolocronConfig;
		const s = setup({ resolved: withRoutes });
		await s.run(app("comlink", withRoutes));
		expect(s.syncSecrets.mock.calls[0]![0]).toMatchObject({
			secretRoutes: [{ keys: ["A"] }],
			variableRoutes: [{ keys: ["V"] }],
		});
	});

	it("gives an environment that holds only variables an empty list of secret routes", async () => {
		const variablesOnly = {
			providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } },
			repo: {
				secrets: { deploy: [{ environment: ENV, keys: ["A"] }] },
				variables: { sync: [{ environment: ENV, scope: "repo", keys: ["V"] }] },
			},
		} as unknown as ResolvedHolocronConfig;
		const s = setup({ resolved: variablesOnly });
		await s.run(app("comlink", variablesOnly));
		expect(s.syncSecrets.mock.calls[0]![0]).toMatchObject({ secretRoutes: [] });
	});

	it("passes no filter when no deploy entry names the environment, so the sync itself refuses", async () => {
		const other = {
			providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } },
			repo: { secrets: { deploy: [{ environment: "elsewhere", prefix: "X_" }] } },
		} as unknown as ResolvedHolocronConfig;
		const s = setup({ resolved: other });
		await s.run(app("comlink", other));
		expect(s.syncSecrets.mock.calls[0]![0]).not.toHaveProperty("deployFilter");
	});

	it("writes nothing when the project does not serve the app's domain", async () => {
		const s = setup({ domains: ["other.example"] });
		const report = await s.run(app("sentinel", sentinelConfig));
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/does not serve sentinel\.example/);
		expect(s.syncSecrets).not.toHaveBeenCalled();
	});

	it("fails when the deployment provider did not load", async () => {
		const s = setup({ hasDeployment: false });
		expect((await s.run(app("sentinel", sentinelConfig))).message).toMatch(/did not load/);
		expect(s.syncSecrets).not.toHaveBeenCalled();
	});

	it("skips the domain check for an app that names no domain, and says so", async () => {
		const noDomain = {
			providers: { deployment: { cardinality: "single", tuple: tuple("vercel") } },
			repo: { secrets: { deploy } },
		} as unknown as ResolvedHolocronConfig;
		const s = setup({ resolved: noDomain });
		expect((await s.run(app("sentinel", noDomain))).status).toBe("ok");
		expect(s.print).toHaveBeenCalledWith(expect.stringContaining("was not checked"));
	});

	it("reports an app with no destination as having nothing to sync, without loading it", async () => {
		const s = setup();
		const report = await s.run(app("council"));
		expect(report.status).toBe("nothing");
		expect(report.message).toMatch(/nothing to do/);
		expect(s.load).not.toHaveBeenCalled();
	});

	it("fails for an app with a destination and no repo.secrets.deploy, naming the missing entry", async () => {
		const bare = {
			providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } },
		} as unknown as ResolvedHolocronConfig;
		const s = setup();
		const report = await s.run(app("comlink", bare));
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/no `repo\.secrets\.deploy` entry/);
		expect(s.syncSecrets).not.toHaveBeenCalled();
	});

	it("fails for an app whose config cannot be read", async () => {
		const report = await setup().run(app("sentinel", undefined, { configError: "boom" }));
		expect(report).toMatchObject({ status: "fail", message: expect.stringContaining("boom") });
	});

	it("fails when a secret did not sync", async () => {
		const s = setup();
		s.syncSecrets.mockResolvedValueOnce({ rows: [], summary: { ok: 1, fail: 2, skip: 0, dryRun: 0 } });
		expect(await s.run(app("sentinel", sentinelConfig))).toEqual({
			status: "fail",
			message: "sentinel: production: 2 secret(s) did not sync",
		});
	});

	it("marks a dry run in the heading, and prints to the console when no print is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const s = setup({ dryRun: true });
		await s.run(app("sentinel", sentinelConfig), { print: undefined });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("(dry-run)"));
		log.mockRestore();
	});
});
