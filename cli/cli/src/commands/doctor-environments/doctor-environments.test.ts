import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorEnvironments } from "./doctor-environments.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (repo: Record<string, unknown> | undefined, providers: Record<string, unknown>): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers, repo } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

const WITH_PROVIDER = { environments: "github" };

function loaderWith(loaded: LoadedConfig, environments: Record<string, unknown> | null): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github" || !environments) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: "gh",
				capabilities: { environments: () => ({ providerName: "github", ...environments }) },
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

async function run(loaded: LoadedConfig, environments: Record<string, unknown> | null) {
	const lines: string[] = [];
	const report = await runDoctorEnvironments({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, environments),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const listing = (...names: string[]) => ({ listEnvironments: async () => names.map((name) => ({ name })) });

describe("doctor environments", () => {
	it("passes when staging and production exist, whatever their case, and ignores extra ones", async () => {
		const { report, lines } = await run(
			loadedWith(undefined, WITH_PROVIDER),
			listing("Staging", "production", "preview")
		);
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({ id: "environments", status: "ok", detail: "2 of 2 exist" });
		expect(lines[0]).toContain("environments exist");
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("also expects the environments repo.secrets names, once each", async () => {
		const { report } = await run(
			loadedWith({ secrets: { environments: { Production: ["A"], qa: ["B"] } } }, WITH_PROVIDER),
			listing("staging", "production", "qa")
		);
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "3 of 3 exist" });
	});

	it("fails on a missing environment and says which", async () => {
		const { report } = await run(
			loadedWith({ secrets: { environments: { qa: ["B"] } } }, WITH_PROVIDER),
			listing("production")
		);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "2 problem(s)" });
		expect(report.rows[0]!.problems).toEqual(["missing environment staging", "missing environment qa"]);
	});

	it("fails with the message when the read throws", async () => {
		const { report } = await run(loadedWith(undefined, WITH_PROVIDER), {
			listEnvironments: async () => {
				throw new Error("403 Forbidden");
			},
		});
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "403 Forbidden" });
	});

	it("skips, with the message, when the provider has no token for it", async () => {
		const { report } = await run(loadedWith(undefined, WITH_PROVIDER), {
			listEnvironments: async () => {
				throw new MissingTokenError("needs the admin token");
			},
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("needs the admin token");
	});

	it("says none declared when there is no provider and no environment is named", async () => {
		const { report } = await run(loadedWith(undefined, {}), null);
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "none declared" });
		expect(report.reason).toBeUndefined();
	});

	it("skips, with the reason, when environments are named but there is no provider", async () => {
		const { report, lines } = await run(loadedWith({ secrets: { environments: { qa: ["B"] } } }, {}), null);
		expect(report.status).toBe("skip");
		expect(report.rows[0]!.detail).toBe("no `environments` provider to check them with");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 1 skipped");
	});

	it("prints to the console and builds its own loader when none is passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorEnvironments({
			loaded: loadedWith(undefined, {}),
			context: { repoRoot: "/tmp/test" },
		});
		log.mockRestore();
		expect(report.status).toBe("ok");
	});
});
