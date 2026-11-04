import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
// The default connector would start a real cloudflared.
const runCloudflared = vi.hoisted(() => vi.fn(async (_token: string) => 0));
vi.mock("../run-cloudflared/index.js", () => ({ runCloudflared }));

import { runTunnelUp } from "./tunnel-up.js";

const TOKEN = "TUNNEL-TOKEN-VALUE";
const ENSURED = {
	id: "tun-1",
	name: "sentinel-dev",
	created: true,
	configured: true,
	target: "tun-1.cfargotunnel.com",
};

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
}

function makePlugin(caps: Record<string, unknown>) {
	return {
		createPlugin: () => ({
			name: "cf",
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

const config = { name: "demo", providers: { tunnels: "cloudflare", dns: "cloudflare" } } as const;

function setup(
	over: { tunnels?: Record<string, unknown>; dns?: Record<string, unknown>; modules?: Record<string, unknown> } = {}
) {
	const loaded = loadedFrom(config);
	const tunnels = {
		providerName: "cloudflare",
		ensureTunnel: vi.fn(async () => ENSURED),
		tunnelToken: vi.fn(async () => TOKEN),
		...over.tunnels,
	};
	const dns = { providerName: "cloudflare", upsertRecord: vi.fn(async (_d: string, r: unknown) => r), ...over.dns };
	const loader = makeLoaderWith(loaded, {
		"@theholocron/holocron-plugin-cloudflare": makePlugin({ tunnels, dns }),
		...over.modules,
	});
	const lines: string[] = [];
	const base = {
		loaded,
		context: { repoRoot: "/tmp/test" },
		name: "sentinel-dev",
		hostname: "sentinel-dev.example.dev",
		port: 3000,
		loader,
		print: (line: string) => lines.push(stripVTControlCharacters(line)),
		logger: fakeLogger(),
	};
	return { base, tunnels, dns, lines, said: () => lines.join("\n") };
}

describe("runTunnelUp", () => {
	it("makes the tunnel and points a proxied CNAME at it, without running it", async () => {
		const { base, tunnels, dns, said } = setup();
		const report = await runTunnelUp(base);

		expect(tunnels.ensureTunnel).toHaveBeenCalledWith({
			name: "sentinel-dev",
			hostname: "sentinel-dev.example.dev",
			service: "http://localhost:3000",
		});
		expect(dns.upsertRecord).toHaveBeenCalledWith("sentinel-dev.example.dev", {
			type: "CNAME",
			name: "sentinel-dev.example.dev",
			content: "tun-1.cfargotunnel.com",
			proxied: true,
		});
		expect(tunnels.tunnelToken).not.toHaveBeenCalled();
		expect(report).toMatchObject({
			status: "ok",
			tunnelId: "tun-1",
			url: "https://sentinel-dev.example.dev",
			summary: { ok: 2, fail: 0 },
		});
		expect(said()).toContain("created, route set");
		expect(said()).toContain("address: https://sentinel-dev.example.dev");
		expect(said()).toContain("--run");
		expect(said()).toContain("2 ok, 0 failed");
	});

	it("does not print the start hint when the caller runs the tunnel itself", async () => {
		const { base, said } = setup();
		await runTunnelUp({ ...base, hint: false });
		expect(said()).not.toContain("start it with");
		expect(said()).toContain("address: https://sentinel-dev.example.dev");
	});

	it("says a tunnel that was there and in step was found", async () => {
		const { base, said } = setup({
			tunnels: { ensureTunnel: vi.fn(async () => ({ ...ENSURED, created: false, configured: false })) },
		});
		await runTunnelUp(base);
		expect(said()).toContain("found, route in step");
	});

	it("runs the connector with the token when asked, and never prints the token", async () => {
		const runConnector = vi.fn(async (_token: string) => 0);
		const { base, said } = setup();
		const report = await runTunnelUp({ ...base, run: true, runConnector });

		expect(runConnector).toHaveBeenCalledWith(TOKEN);
		expect(report).toMatchObject({ status: "ok", exitCode: 0, summary: { ok: 3, fail: 0 } });
		expect(said()).toContain("running cloudflared");
		expect(said()).not.toContain(TOKEN);
	});

	it("fails when the connector exits non-zero", async () => {
		const { base } = setup();
		const report = await runTunnelUp({ ...base, run: true, runConnector: async () => 2 });
		expect(report).toMatchObject({ status: "fail", exitCode: 2 });
	});

	it("fails when the connector cannot be started or the token cannot be read", async () => {
		const missing = setup();
		const started = await runTunnelUp({
			...missing.base,
			run: true,
			runConnector: async () => {
				throw new Error("cloudflared is not installed");
			},
		});
		expect(started.status).toBe("fail");
		expect(missing.said()).toContain("cloudflared is not installed");

		const noToken = setup({
			tunnels: {
				tunnelToken: vi.fn(async () => {
					throw new Error("403");
				}),
			},
		});
		expect((await runTunnelUp({ ...noToken.base, run: true })).status).toBe("fail");
		expect(noToken.said()).toContain("403");
	});

	it("changes nothing on a dry run, and says what it would do", async () => {
		const { base, tunnels, dns, said } = setup();
		const report = await runTunnelUp({ ...base, context: { repoRoot: "/tmp/test", dryRun: true } });

		expect(tunnels.ensureTunnel).not.toHaveBeenCalled();
		expect(dns.upsertRecord).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "ok", url: "https://sentinel-dev.example.dev" });
		expect(said()).toContain("would serve sentinel-dev.example.dev at http://localhost:3000");
		expect(said()).toContain("(dry-run)");
	});

	it("stops at a tunnel it could not make, before touching DNS", async () => {
		const { base, dns, said } = setup({
			tunnels: {
				ensureTunnel: vi.fn(async () => {
					throw new Error("403 forbidden");
				}),
			},
		});
		const report = await runTunnelUp(base);

		expect(report).toMatchObject({ status: "fail", summary: { ok: 0, fail: 1 } });
		expect(dns.upsertRecord).not.toHaveBeenCalled();
		expect(said()).toContain("403 forbidden");
	});

	it("reports the tunnel id when DNS could not be set", async () => {
		const { base, said } = setup({
			dns: {
				upsertRecord: vi.fn(async () => {
					throw new Error("no zone");
				}),
			},
		});
		const report = await runTunnelUp(base);

		expect(report).toMatchObject({ status: "fail", tunnelId: "tun-1" });
		expect(said()).toContain("no zone");
	});

	it("says how to configure a missing tunnels provider", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { dns: "cloudflare" } });
		const { base, said } = setup();
		const loader = makeLoaderWith(loaded, { "@theholocron/holocron-plugin-cloudflare": makePlugin({ dns: {} }) });
		const report = await runTunnelUp({ ...base, loaded, loader });

		expect(report.status).toBe("fail");
		expect(said()).toContain("needs a `tunnels` provider");
	});

	it("says how to configure a missing dns provider", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { tunnels: "cloudflare" } });
		const { base, said } = setup();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin({ tunnels: {} }),
		});
		const report = await runTunnelUp({ ...base, loaded, loader });

		expect(report.status).toBe("fail");
		expect(said()).toContain("needs a `dns` provider");
	});

	it("gives the reason a provider failed to load instead of the generic hint", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { tunnels: "cloudflare", dns: "cloudflare" } });
		const { base, said } = setup();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": {
				createPlugin: () => {
					throw new Error("Cloudflare accountId is required for Tunnels");
				},
			},
		});
		const report = await runTunnelUp({ ...base, loaded, loader });

		expect(report.status).toBe("fail");
		expect(said()).toContain("failed to load");
		expect(said()).toContain("accountId is required");
	});

	it("prints to stdout, logs through the command logger and runs cloudflared by default", async () => {
		const { base } = setup();
		const { print: _print, logger: _logger, ...rest } = base;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const report = await runTunnelUp({ ...rest, run: true });
			expect(report.status).toBe("ok");
			expect(runCloudflared).toHaveBeenCalledWith(TOKEN);
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it("builds its own loader when none is given", async () => {
		const { base, said } = setup();
		const { loader: _loader, ...rest } = base;
		// No providers are configured, so the loader it builds has nothing to offer.
		const report = await runTunnelUp({
			...rest,
			loaded: loadedFrom({ name: "demo", providers: { source: "github" } }),
		});
		expect(report.status).toBe("fail");
		expect(said()).toContain("needs a `tunnels` provider");
	});
});
