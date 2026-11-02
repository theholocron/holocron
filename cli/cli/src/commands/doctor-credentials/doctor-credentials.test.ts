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
		providers: { credentials: ["1password"], source: "github" },
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
	it("passes when the environment holds every variable the plugins take", async () => {
		const impl = inspecting("Holocron", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN", "EXTRA");
		const { report, lines } = await run(
			loadedWith({ providers: { credentials: ["1password"], source: "github" } }),
			impl
		);
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({ id: "1password", status: "ok" });
		expect(report.rows[0]?.detail).toBe('"Holocron" has 3 variable(s), 1 of 1 expected present');
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("fails and names each variable the environment lacks", async () => {
		const { report } = await run(loadedWith(), inspecting("Holocron", "SOMETHING_ELSE"));
		expect(report.status).toBe("fail");
		expect(report.rows[0]?.problems).toEqual(["missing variable HOLOCRON_ORG_TOKEN"]);
	});

	it("says which spelling matched when it is not the one the config writes", async () => {
		const { report } = await run(
			loadedWith({ credentials: { environment: "holocron" } }),
			inspecting("Holocron", "HOLOCRON_ORG_TOKEN")
		);
		expect(report.rows[0]?.detail).toBe(
			'"Holocron" (the config writes "holocron") has 1 variable(s), 1 of 1 expected present'
		);
	});

	it("fails when the provider cannot find the environment", async () => {
		const impl = {
			inspect: vi.fn(async () => Promise.reject(new Error('1Password has no Environment named "Holocron"'))),
		};
		const { report } = await run(loadedWith(), impl);
		expect(report.status).toBe("fail");
		expect(report.rows[0]?.detail).toContain("has no Environment");
	});

	it("skips a provider that cannot list names without values", async () => {
		const { report } = await run(loadedWith(), {});
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("without reading their values");
	});

	it("expects nothing of a plugin it cannot load, and still passes", async () => {
		const impl = inspecting("Holocron");
		const { report } = await run(loadedWith(), impl, async () => {
			throw new Error("MODULE_NOT_FOUND");
		});
		expect(report.rows[0]).toMatchObject({
			status: "ok",
			detail: '"Holocron" has 0 variable(s), 0 of 0 expected present',
		});
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

	it("skips when the config names a provider but no environment", async () => {
		const loaded = loadedWith();
		const noEnvironment = { ...loaded, resolved: { ...loaded.resolved, credentials: undefined } };
		const { report } = await run(noEnvironment, inspecting("Holocron"));
		expect(report.reason).toBe("`credentials.environment` is not set");
	});

	it("takes a plugin that lists no tokens as expecting none", async () => {
		const { report } = await run(loadedWith(), inspecting("Holocron", "A"), async () => ({}));
		expect(report.rows[0]?.status).toBe("ok");
	});

	it("prints to the console and builds its own loader and importer when it is given none", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const loaded = loadedWith({ providers: { credentials: ["1password"] } });
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
			});
			expect(report.rows.length).toBeGreaterThan(0);
			expect(log).toHaveBeenCalled();
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
