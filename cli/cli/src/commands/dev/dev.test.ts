import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The defaults would set up a real tunnel and start real processes.
const defaultTunnel = vi.hoisted(() => vi.fn());
const defaultProcesses = vi.hoisted(() => vi.fn());
vi.mock("../tunnel-up/index.js", () => ({ runTunnelUp: defaultTunnel }));
vi.mock("@theholocron/dagobah", () => ({ superviseProcesses: defaultProcesses }));

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDev } from "./dev.js";

const VALUE = "SUPER-SECRET-VALUE";
const TOKEN = "TUNNEL-TOKEN-VALUE";
const TUNNEL_OK = {
	status: "ok" as const,
	tunnelId: "tun-1",
	url: "https://sentinel-dev.example.dev",
	summary: { ok: 2, fail: 0 },
};

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
}

function makePlugin(caps: Record<string, unknown>) {
	return {
		createPlugin: () => ({
			name: "p",
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function loaderFor(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

const config = { name: "demo", providers: { vault: "1password", tunnels: "cloudflare", dns: "cloudflare" } } as const;

function setup(over: { vault?: Record<string, unknown> | null; tunnels?: Record<string, unknown> } = {}) {
	const loaded = loadedFrom(config);
	const readEnvironment = vi.fn(async () => ({ GITHUB_APP_ID: "7", GITHUB_APP_PRIVATE_KEY: VALUE }));
	const vault: Record<string, unknown> =
		over.vault === null
			? { providerName: "1password" }
			: { providerName: "1password", readEnvironment, ...over.vault };
	const tunnels = { providerName: "cloudflare", tunnelToken: vi.fn(async () => TOKEN), ...over.tunnels };
	const loader = loaderFor(loaded, {
		"@theholocron/holocron-plugin-1password": makePlugin({ vault }),
		"@theholocron/holocron-plugin-cloudflare": makePlugin({ tunnels, dns: {} }),
	});
	const lines: string[] = [];
	const ensureTunnel = vi.fn(async () => TUNNEL_OK);
	const runProcesses = vi.fn(async () => ({ exitCode: 0, endedFirst: "primary" as const, interrupted: true }));
	const base = {
		loaded,
		context: { repoRoot: "/tmp/test" },
		environment: "acme/app - dev",
		name: "sentinel-dev",
		hostname: "sentinel-dev.example.dev",
		port: 3000,
		command: ["pnpm", "run", "serve"],
		loader,
		print: (line: string) => lines.push(stripVTControlCharacters(line)),
		logger: fakeLogger(),
		ensureTunnel,
		runProcesses,
	};
	return {
		base,
		vault: { readEnvironment: (vault["readEnvironment"] ?? readEnvironment) as ReturnType<typeof vi.fn> },
		tunnels,
		ensureTunnel,
		runProcesses,
		said: () => lines.join("\n"),
	};
}

/** The environment the application was started with, from the first call to a faked `runProcesses`. */
const appEnv = (runProcesses: ReturnType<typeof vi.fn>): Record<string, string> =>
	(runProcesses.mock.calls as unknown as Array<[{ primary: { env: Record<string, string> } }]>)[0]![0].primary.env;

beforeEach(() => vi.clearAllMocks());

describe("runDev", () => {
	it("sets up the tunnel, reads the environment and runs the application beside the connector", async () => {
		const { base, ensureTunnel, runProcesses, vault, said } = setup();
		const report = await runDev(base);

		expect(ensureTunnel).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "sentinel-dev",
				hostname: "sentinel-dev.example.dev",
				port: 3000,
				run: false,
				hint: false,
			})
		);
		expect(vault.readEnvironment).toHaveBeenCalledWith("acme/app - dev");
		expect(runProcesses).toHaveBeenCalledWith({
			primary: {
				command: "pnpm",
				args: ["run", "serve"],
				env: {
					ENVIRONMENT: "development",
					HOLOCRON_ENVIRONMENT: "development",
					GITHUB_APP_ID: "7",
					GITHUB_APP_PRIVATE_KEY: VALUE,
					PORT: "3000",
					HOLOCRON_PORT: "3000",
				},
			},
			companion: {
				command: "cloudflared",
				args: ["tunnel", "--no-autoupdate", "run"],
				env: { TUNNEL_TOKEN: TOKEN },
			},
		});
		expect(report).toMatchObject({ status: "ok", exitCode: 0, summary: { ok: 4, fail: 0 } });
		expect(said()).toContain("2 variables, passed to the application");
		expect(said()).toContain("running pnpm run serve and cloudflared");
	});

	it("never prints a variable's value or the tunnel's token", async () => {
		const { base, said } = setup();
		await runDev(base);
		expect(said()).not.toContain(VALUE);
		expect(said()).not.toContain(TOKEN);
	});

	it("lets --port win over a PORT in the vault, since the tunnel sends requests there", async () => {
		const { base, runProcesses } = setup({ vault: { readEnvironment: vi.fn(async () => ({ PORT: "9999" })) } });
		await runDev({ ...base, port: 4000 });
		expect(runProcesses).toHaveBeenCalledWith(
			expect.objectContaining({
				primary: expect.objectContaining({
					env: {
						ENVIRONMENT: "development",
						HOLOCRON_ENVIRONMENT: "development",
						PORT: "4000",
						HOLOCRON_PORT: "4000",
					},
				}),
			})
		);
	});

	it("tags the application as dev for its logger, unless the vault says otherwise", async () => {
		const plain = setup();
		await runDev(plain.base);
		expect(appEnv(plain.runProcesses)["ENVIRONMENT"]).toBe("development");
		expect(appEnv(plain.runProcesses)["HOLOCRON_ENVIRONMENT"]).toBe("development");

		const staged = setup({ vault: { readEnvironment: vi.fn(async () => ({ ENVIRONMENT: "test" })) } });
		await runDev(staged.base);
		expect(appEnv(staged.runProcesses)["ENVIRONMENT"]).toBe("test");
		expect(appEnv(staged.runProcesses)["HOLOCRON_ENVIRONMENT"]).toBe("test");

		const prefixed = setup({
			vault: { readEnvironment: vi.fn(async () => ({ HOLOCRON_ENVIRONMENT: "production" })) },
		});
		await runDev(prefixed.base);
		expect(appEnv(prefixed.runProcesses)["ENVIRONMENT"]).toBe("production");
		expect(appEnv(prefixed.runProcesses)["HOLOCRON_ENVIRONMENT"]).toBe("production");
	});

	it("fails when the application ends with an error", async () => {
		const { base, runProcesses } = setup();
		runProcesses.mockResolvedValueOnce({ exitCode: 2, endedFirst: "primary", interrupted: false });
		expect(await runDev(base)).toMatchObject({ status: "fail", exitCode: 2 });
	});

	it("fails with the reason when a process cannot be started", async () => {
		const { base, runProcesses, said } = setup();
		runProcesses.mockRejectedValueOnce(new Error("cloudflared is not installed or not on the PATH"));
		expect((await runDev(base)).status).toBe("fail");
		expect(said()).toContain("cloudflared is not installed");
	});

	it("stops at a tunnel that could not be set up, before reading the vault", async () => {
		const { base, ensureTunnel, vault, runProcesses } = setup();
		ensureTunnel.mockResolvedValueOnce({ status: "fail", summary: { ok: 0, fail: 1 } } as never);
		const report = await runDev(base);
		expect(report).toMatchObject({ status: "fail", summary: { ok: 0, fail: 1 } });
		expect(vault.readEnvironment).not.toHaveBeenCalled();
		expect(runProcesses).not.toHaveBeenCalled();
	});

	it("reads nothing and runs nothing on a dry run, and says what it would do", async () => {
		const { base, ensureTunnel, vault, runProcesses, said } = setup();
		const report = await runDev({ ...base, context: { repoRoot: "/tmp/test", dryRun: true } });
		expect(ensureTunnel).toHaveBeenCalledWith(
			expect.objectContaining({ context: expect.objectContaining({ dryRun: true }) })
		);
		expect(vault.readEnvironment).not.toHaveBeenCalled();
		expect(runProcesses).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
		expect(said()).toContain("would read its variables");
		expect(said()).toContain("(dry-run)");
	});

	it("fails when the vault cannot be read, naming the environment", async () => {
		const { base, said, runProcesses } = setup({
			vault: {
				readEnvironment: vi.fn(async () => {
					throw new Error("environment not found");
				}),
			},
		});
		expect((await runDev(base)).status).toBe("fail");
		expect(said()).toContain("vault acme/app - dev");
		expect(said()).toContain("environment not found");
		expect(runProcesses).not.toHaveBeenCalled();
	});

	it("fails when the tunnel's token cannot be read", async () => {
		const { base, said } = setup({
			tunnels: {
				tunnelToken: vi.fn(async () => {
					throw new Error("403");
				}),
			},
		});
		expect((await runDev(base)).status).toBe("fail");
		expect(said()).toContain("403");
	});

	it("says what is missing when there is no vault, or one that cannot read an environment", async () => {
		const noReader = setup({ vault: null });
		expect((await runDev(noReader.base)).status).toBe("fail");
		expect(noReader.said()).toContain("cannot read an environment's variables");
		expect(noReader.ensureTunnel).not.toHaveBeenCalled();

		const loaded = loadedFrom({ name: "demo", providers: { tunnels: "cloudflare", dns: "cloudflare" } });
		const none = setup();
		const loader = loaderFor(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin({ tunnels: {}, dns: {} }),
		});
		expect((await runDev({ ...none.base, loaded, loader })).status).toBe("fail");
		expect(none.said()).toContain("needs a `vault` provider");
	});

	it("builds its own loader, prints to stdout, logs through the command logger and uses the real steps by default", async () => {
		defaultTunnel.mockResolvedValue(TUNNEL_OK);
		defaultProcesses.mockResolvedValue({ exitCode: 0, endedFirst: "primary", interrupted: true });
		const { base } = setup();
		const { loader: _l, print: _p, logger: _g, ensureTunnel: _e, runProcesses: _r, ...rest } = base;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			// No providers are configured here, so the loader it builds has no vault and it stops there.
			const report = await runDev({
				...rest,
				loaded: loadedFrom({ name: "demo", providers: { source: "github" } }),
			});
			expect(report.status).toBe("fail");
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it("uses runTunnelUp and superviseProcesses when none are given", async () => {
		defaultTunnel.mockResolvedValue(TUNNEL_OK);
		defaultProcesses.mockResolvedValue({ exitCode: 0, endedFirst: "primary", interrupted: true });
		const { base } = setup();
		const { ensureTunnel: _e, runProcesses: _r, ...rest } = base;
		expect((await runDev(rest)).status).toBe("ok");
		expect(defaultTunnel).toHaveBeenCalledTimes(1);
		expect(defaultProcesses).toHaveBeenCalledTimes(1);
	});
});
