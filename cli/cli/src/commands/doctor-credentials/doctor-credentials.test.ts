import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { clearCredentials, getCredential } from "../../auth/index.js";
import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type CredentialsInspection, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import { runDoctorCredentials } from "./doctor-credentials.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({
		name: "demo",
		providers: { credentials: ["1password"], source: "github", dns: "cloudflare" },
		credentials: { environment: "Holocron" },
		...extra,
	} as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

type Impl = { inspect?: (environment: string) => Promise<CredentialsInspection>; read?: () => Promise<unknown> };

function loaderWith(loaded: LoadedConfig, impl: Impl | null): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-1password" && impl) {
			return {
				createPlugin: () => ({
					name: "1password",
					capabilities: { credentials: () => ({ key: "credentials", providerName: "1password", ...impl }) },
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-github") {
			return {
				createPlugin: () => ({ name: "github", capabilities: { source: () => ({}) } }),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter, {
		readCredentials: false,
	});
}

const TOKENS = {
	"@theholocron/holocron-plugin-github": { tokens: [{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" }] },
	"@theholocron/holocron-plugin-cloudflare": {
		tokens: [{ envName: "HOLOCRON_CLOUDFLARE_TOKEN", keyringKey: "cloudflare" }],
	},
};
const tokensImporter: AuthImporter = async (pkg) => {
	const found = TOKENS[pkg as keyof typeof TOKENS];
	if (!found) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	return found;
};

async function run(loaded: LoadedConfig, impl: Impl | null, importer = tokensImporter) {
	const lines: string[] = [];
	const report = await runDoctorCredentials({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, impl),
		importer,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const inspecting = (environment: string, ...names: string[]) => ({
	inspect: vi.fn(async () => ({ environment, names })),
});

describe("doctor credentials", () => {
	it("prints one ok row per variable the plugins take, in code-unit order, and counts the variables", async () => {
		const impl = inspecting("Holocron", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN", "EXTRA");
		const { report, lines } = await run(loadedWith(), impl);
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["1password:HOLOCRON_CLOUDFLARE_TOKEN", "ok", 'present in "Holocron"'],
			["1password:HOLOCRON_ORG_TOKEN", "ok", 'present in "Holocron"'],
		]);
		expect(lines).toEqual([
			'  ✓ 1password: HOLOCRON_CLOUDFLARE_TOKEN  present in "Holocron"',
			'  ✓ 1password: HOLOCRON_ORG_TOKEN         present in "Holocron"',
			"",
			"2 ok, 0 fail, 0 skipped",
		]);
	});

	it("sorts by code unit, not by locale", async () => {
		const tokens: AuthImporter = async () => ({
			tokens: ["b_TOKEN", "A_TOKEN", "a_TOKEN", "B_TOKEN"].map((envName) => ({ envName, keyringKey: envName })),
		});
		const { report } = await run(loadedWith(), inspecting("Holocron"), tokens);
		expect(report.rows.map((r) => r.id)).toEqual([
			"1password:A_TOKEN",
			"1password:B_TOKEN",
			"1password:a_TOKEN",
			"1password:b_TOKEN",
		]);
	});

	describe("a token a plugin only falls back to", () => {
		const withOptional: AuthImporter = async (pkg) =>
			pkg.endsWith("github")
				? {
						tokens: [
							{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" },
							{ envName: "HOLOCRON_FALLBACK_WEBHOOK", keyringKey: "fallback", optional: true },
						],
					}
				: tokensImporter(pkg);

		it("is a skipped row that says it is optional and not set", async () => {
			const { report, lines } = await run(
				loadedWith(),
				inspecting("Holocron", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN"),
				withOptional
			);
			expect(report.status).toBe("ok");
			expect(report.summary).toEqual({ ok: 2, fail: 0, skip: 1 });
			expect(report.rows[1]).toMatchObject({
				id: "1password:HOLOCRON_FALLBACK_WEBHOOK",
				status: "skip",
				detail: 'optional, not set in "Holocron"',
			});
			expect(lines.at(-1)).toBe("2 ok, 0 fail, 1 skipped");
		});

		it("is an ok row when the environment has it", async () => {
			const { report } = await run(
				loadedWith(),
				inspecting("Holocron", "HOLOCRON_ORG_TOKEN", "HOLOCRON_FALLBACK_WEBHOOK", "HOLOCRON_CLOUDFLARE_TOKEN"),
				withOptional
			);
			expect(report.summary).toEqual({ ok: 3, fail: 0, skip: 0 });
		});

		it("is expected after all when another plugin lists the same name as needed", async () => {
			const both: AuthImporter = async (pkg) =>
				pkg.endsWith("github")
					? { tokens: [{ envName: "HOLOCRON_SHARED", keyringKey: "a", optional: true }] }
					: { tokens: [{ envName: "HOLOCRON_SHARED", keyringKey: "a" }] };
			const { report } = await run(
				loadedWith({ providers: { credentials: ["1password"], source: "github", errors: "sentry" } }),
				inspecting("Holocron", "SOMETHING_ELSE"),
				both
			);
			expect(report.status).toBe("fail");
			expect(report.rows).toHaveLength(1);
			expect(report.rows[0]).toMatchObject({ status: "fail", detail: 'missing from "Holocron"' });
		});
	});

	it("fails a row for each variable the environment lacks", async () => {
		const { report, lines } = await run(loadedWith(), inspecting("Holocron", "HOLOCRON_ORG_TOKEN"));
		expect(report.status).toBe("fail");
		expect(report.summary).toEqual({ ok: 1, fail: 1, skip: 0 });
		expect(lines[0]).toBe('  ✗ 1password: HOLOCRON_CLOUDFLARE_TOKEN  missing from "Holocron"');
	});

	it("says which spelling matched when it is not the one the config writes", async () => {
		const { report } = await run(
			loadedWith({ credentials: { environment: "holocron" } }),
			inspecting("Holocron", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN")
		);
		expect(report.rows[0]?.detail).toBe('present in "Holocron" (the config writes "holocron")');
	});

	it("fails once when the provider cannot find the environment", async () => {
		const impl = {
			inspect: vi.fn(async () => Promise.reject(new Error('1Password has no Environment named "Holocron"'))),
		};
		const { report } = await run(loadedWith(), impl);
		expect(report.status).toBe("fail");
		expect(report.rows).toHaveLength(1);
		expect(report.rows[0]).toMatchObject({ id: "1password", status: "fail" });
		expect(report.rows[0]?.detail).toContain("has no Environment");
	});

	it("skips a provider that cannot list names without values", async () => {
		const { report } = await run(loadedWith(), {});
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("without reading their values");
	});

	it("skips with one row when no plugin that can be loaded lists a token", async () => {
		const impl = inspecting("Holocron");
		const { report } = await run(loadedWith(), impl, async () => {
			throw new Error("MODULE_NOT_FOUND");
		});
		expect(impl.inspect).not.toHaveBeenCalled();
		expect(report.rows).toEqual([
			{
				id: "1password",
				title: "1password",
				status: "skip",
				detail: "no configured plugin lists the tokens it takes",
				problems: [],
			},
		]);
	});

	it("fails a provider whose package did not load", async () => {
		const { report } = await run(loadedWith(), null);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ id: "1password", status: "fail" });
		expect(report.rows[0]?.detail).toContain("failed to load");
	});

	it("skips when no credentials provider is configured", async () => {
		const loaded = loadedWith({ providers: { source: "github" }, credentials: undefined });
		const { report } = await run(loaded, null);
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `credentials` provider is configured");
	});

	it("fails a provider that has neither its own environment option nor a shared one", async () => {
		const loaded = loadedWith();
		const noEnvironment = { ...loaded, resolved: { ...loaded.resolved, credentials: undefined } };
		const { report } = await run(noEnvironment, inspecting("Holocron"));
		expect(report.status).toBe("fail");
		expect(report.rows[0]?.detail).toContain("no `environment` option and `credentials.environment` is not set");
	});

	it("skips a loaded provider the config gives no environment", async () => {
		const loaded = loadedWith();
		const loader = {
			load: async () => {},
			loadedKeys: () => ["credentials"],
			loadFailures: () => [],
			has: () => true,
			get: () => [
				{
					key: "credentials",
					providerName: "stranger",
					inspect: async () => ({ environment: "x", names: [] }),
				},
			],
		} as unknown as PluginLoader;
		const lines: string[] = [];
		const report = await runDoctorCredentials({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			importer: tokensImporter,
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `environment` option and `credentials.environment` is not set");
	});

	it("reads the environment a provider names itself, ahead of the shared one", async () => {
		const impl = inspecting("Own", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN");
		const loaded = loadedWith({
			providers: { credentials: [["1password", { environment: "Own" }]], source: "github" },
		});
		const { report } = await run(loaded, impl);
		expect(impl.inspect).toHaveBeenCalledWith("Own");
		expect(report.status).toBe("ok");
	});

	it("takes a plugin that lists no tokens as expecting none", async () => {
		const { report } = await run(loadedWith(), inspecting("Holocron", "A"), async () => ({}));
		expect(report.rows[0]?.status).toBe("skip");
	});

	it("prints to the console and loads the plugins' tokens itself when it is given neither", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const loaded = loadedWith();
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader: loaderWith(loaded, inspecting("Holocron")),
			});
			// The real plugins' tokens are expected here, so a stub environment with none of them fails: only the row matters.
			expect(report.rows[0]).toMatchObject({ id: "1password:HOLOCRON_ADMIN_TOKEN", status: "fail" });
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it("builds its own loader when it is given none, and runs no provider when none is configured", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const loaded = loadedWith({ providers: { source: "github" }, credentials: undefined });
			const report = await runDoctorCredentials({ loaded, context: { repoRoot: "/tmp/test" } });
			expect(report.reason).toBe("no `credentials` provider is configured");
		} finally {
			log.mockRestore();
		}
	});

	it("never reads a value: the loader it makes asks the provider for none", async () => {
		clearCredentials();
		const read = vi.fn(async () => ({ HOLOCRON_ORG_TOKEN: "secret" }));
		await run(loadedWith(), { ...inspecting("Holocron", "HOLOCRON_ORG_TOKEN"), read });
		expect(read).not.toHaveBeenCalled();
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
	});
});
