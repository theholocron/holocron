import { describe, expect, it, vi } from "vitest";

import type { LoadedConfig, ResolvedHolocronConfig, ResolvedTuple } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AppEnv } from "../app-env/index.js";
import type { WorkspaceApp } from "../resolve-app/index.js";
import { runAppDeploy } from "./app-deploy.js";
import type { RunAppDeployInput } from "./app-deploy.type.js";

const tuple = (provider: string, options: Record<string, unknown> = {}): ResolvedTuple => ({
	provider,
	packageName: `p-${provider}`,
	options,
});
const configOf = (providers: object) => ({ providers }) as unknown as ResolvedHolocronConfig;
const sentinelConfig = configOf({
	deployment: { cardinality: "single", tuple: tuple("vercel", { domain: "sentinel.example" }) },
});
const app = (over: Partial<WorkspaceApp> = {}): WorkspaceApp => ({
	name: "sentinel",
	path: "apps/sentinel",
	dir: "/r/apps/sentinel",
	config: sentinelConfig,
	...over,
});
const production: AppEnv = { layer: "prod", targets: ["production"] };
const everything: AppEnv = { layer: "prod", targets: ["production", "preview"] };

/** Fakes for every seam; `run()` calls `runAppDeploy` with them, `over` replacing any. */
function setup({ domains = ["sentinel.example"], hasDeployment = true, dryRun = false } = {}) {
	const deployment = { providerName: "vercel", listDomains: vi.fn(async () => domains) };
	const loader = {
		load: vi.fn(async () => {}),
		has: vi.fn(() => hasDeployment),
		get: vi.fn(() => deployment),
	} as unknown as PluginLoader;
	const load = vi.fn(async () => ({
		loaded: { resolved: sentinelConfig } as unknown as LoadedConfig,
		context: { repoRoot: "/r/apps/sentinel", dryRun } as RuntimeContext,
		loader,
	}));
	const fakes = {
		load,
		print: vi.fn(),
		build: vi.fn(() => ({ status: "built" as const })),
		stage: vi.fn(() => ({ status: "ok" as const, outDir: "/r/apps/sentinel/.vercel-deploy" })),
		deployFiles: vi.fn(async (_input: object) => ({ deployment: null, status: "ok" as const })),
	};
	const run = (over: Partial<RunAppDeployInput> = {}) =>
		runAppDeploy({ app: app(), env: production, ...fakes, ...over } as RunAppDeployInput);
	return { ...fakes, loader, deployment, run };
}

describe("runAppDeploy", () => {
	it("builds, stages and deploys to production, in the project named for the app", async () => {
		const s = setup();
		expect(await s.run()).toEqual({ status: "ok", message: "sentinel deployed to production" });
		expect(s.deployment.listDomains).toHaveBeenCalledWith("sentinel");
		expect(s.build).toHaveBeenCalledWith("/r/apps/sentinel");
		expect(s.stage).toHaveBeenCalledWith(expect.objectContaining({ packageDir: "/r/apps/sentinel" }));
		expect(s.deployFiles).toHaveBeenCalledTimes(1);
		expect(s.deployFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "sentinel",
				dir: "/r/apps/sentinel/.vercel-deploy",
				target: "production",
			})
		);
	});

	it("deploys a preview after production for both environments, with no target", async () => {
		const s = setup();
		await s.run({ env: everything });
		expect(s.deployFiles).toHaveBeenCalledTimes(2);
		expect(s.deployFiles.mock.calls[0]![0]).toHaveProperty("target", "production");
		expect(s.deployFiles.mock.calls[1]![0]).not.toHaveProperty("target");
	});

	it("stops before building when the project does not serve the app's domain", async () => {
		const s = setup({ domains: ["other.example"] });
		const report = await s.run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/does not serve sentinel\.example/);
		expect(s.build).not.toHaveBeenCalled();
		expect(s.deployFiles).not.toHaveBeenCalled();
	});

	it("deploys when the domain could not be checked, saying so", async () => {
		const s = setup();
		const noDomain = app({ config: configOf({ deployment: { cardinality: "single", tuple: tuple("vercel") } }) });
		expect((await s.run({ app: noDomain })).status).toBe("ok");
		expect(s.print).toHaveBeenCalledWith(expect.stringContaining("was not checked"));
	});

	it("writes nothing on a dry run, after the read-only domain check", async () => {
		const s = setup({ dryRun: true });
		const report = await s.run();
		expect(report.status).toBe("dry-run");
		expect(report.message).toMatch(/would: build and stage apps\/sentinel/);
		expect(s.deployment.listDomains).toHaveBeenCalled();
		expect(s.build).not.toHaveBeenCalled();
		expect(s.stage).not.toHaveBeenCalled();
	});

	it("reports an app with a Worker as deployed by setup notifications, without loading it", async () => {
		const s = setup();
		const comlink = app({
			name: "comlink",
			config: configOf({ workers: { cardinality: "single", tuple: tuple("cloudflare") } }),
		});
		const report = await s.run({ app: comlink });
		expect(report.status).toBe("nothing");
		expect(report.message).toMatch(/setup notifications/);
		expect(s.load).not.toHaveBeenCalled();
	});

	it("reports an app with no config as having nothing to deploy", async () => {
		const s = setup();
		const council = app({ name: "council" });
		delete council.config;
		expect(await s.run({ app: council })).toEqual({
			status: "nothing",
			message: "council: no deployment is configured; nothing to do",
		});
		expect(s.load).not.toHaveBeenCalled();
	});

	it("fails for an app whose config cannot be read", async () => {
		const report = await setup().run({ app: app({ configError: "boom" }) });
		expect(report).toMatchObject({ status: "fail", message: expect.stringContaining("boom") });
	});

	it("fails when the deployment provider did not load", async () => {
		const report = await setup({ hasDeployment: false }).run();
		expect(report.message).toMatch(/did not load/);
	});

	it("fails when the build fails, and does not stage", async () => {
		const s = setup();
		const report = await s.run({ build: () => ({ status: "fail", message: "build broke" }) });
		expect(report.message).toBe("build broke");
		expect(s.stage).not.toHaveBeenCalled();
	});

	it("fails when staging fails or makes no payload", async () => {
		const s = setup();
		const failed = await s.run({ stage: () => ({ status: "fail", message: "no dist" }) });
		expect(failed.message).toBe("stage: no dist");
		const empty = await s.run({ stage: () => ({ status: "ok" }) });
		expect(empty.message).toBe("stage: no payload was made");
		expect(s.deployFiles).not.toHaveBeenCalled();
	});

	it("fails on a failed deployment and does not go on to the preview", async () => {
		const s = setup();
		s.deployFiles.mockResolvedValueOnce({ deployment: null, status: "fail", message: "install failed" } as never);
		const report = await s.run({ env: everything });
		expect(report.message).toBe("production: install failed");
		expect(s.deployFiles).toHaveBeenCalledTimes(1);

		s.deployFiles.mockResolvedValueOnce({ deployment: null, status: "fail" } as never);
		expect((await s.run()).message).toBe("production: the deployment failed");
	});

	it("prints to the console when no print is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await setup({ dryRun: true }).run({ print: undefined });
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});
