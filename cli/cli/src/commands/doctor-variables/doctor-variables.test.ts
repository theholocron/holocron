import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorVariables } from "./doctor-variables.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (variables: unknown, extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({
		name: "demo",
		providers: { source: "github" },
		repo: { name: "acme/demo", variables },
		...extra,
	} as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

function loaderWith(loaded: LoadedConfig, source: Record<string, unknown> | null, context = {}): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github" || !source) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: "gh",
				capabilities: { source: () => ({ providerName: "github", ...source }) },
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", ...context },
		importer as unknown as PluginImporter
	);
}

async function run(
	loaded: LoadedConfig,
	source: Record<string, unknown> | null,
	context: { org?: string; repo?: string } = {}
) {
	const lines: string[] = [];
	const report = await runDoctorVariables({
		loaded,
		context: { repoRoot: "/tmp/test", ...context },
		loader: loaderWith(loaded, source, context),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

describe("doctor variables — what is declared", () => {
	it("says none declared when the config declares no variables", async () => {
		const { report, lines } = await run(loadedWith(undefined, { providers: {} }), null);
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([["variables", "ok", "none declared"]]);
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("treats a declared-empty scope as nothing unless prune is on", async () => {
		expect((await run(loadedWith({ repo: {} }, { providers: {} }), null)).report.rows[0]!.detail).toBe(
			"none declared"
		);
		const pruned = await run(loadedWith({ repo: {}, prune: true }), { listVariables: async () => ({}) });
		expect(pruned.report.rows.map((r) => r.id)).toEqual(["repo-variables"]);
	});
});

describe("doctor variables — repository", () => {
	const declared = { repo: { TURBO_TEAM: "acme", CF_ACCOUNT: "123" } };

	it("passes when every declared variable exists with its value, whatever the case of the name", async () => {
		const { report, lines } = await run(loadedWith(declared), {
			listVariables: async () => ({ turbo_team: "acme", CF_ACCOUNT: "123", OTHER: "x" }),
		});
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "2 of 2 match" });
		expect(lines[0]).toContain("repository variables match");
	});

	it("fails on a missing variable and a different value", async () => {
		const { report } = await run(loadedWith(declared), { listVariables: async () => ({ TURBO_TEAM: "other" }) });
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.problems).toEqual([
			'variable TURBO_TEAM: declared "acme", found "other"',
			"missing variable CF_ACCOUNT",
		]);
	});

	it("reports an undeclared variable only with prune", async () => {
		const have = { TURBO_TEAM: "acme", CF_ACCOUNT: "123", STRAY: "x" };
		expect((await run(loadedWith(declared), { listVariables: async () => have })).report.status).toBe("ok");
		const pruned = await run(loadedWith({ ...declared, prune: true }), { listVariables: async () => have });
		expect(pruned.report.rows[0]!.problems).toEqual(["unexpected variable STRAY"]);
	});

	it("skips when the provider cannot list variables", async () => {
		const { report } = await run(loadedWith(declared), {});
		expect(report.status).toBe("skip");
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "provider does not implement listVariables" });
		expect(report.reason).toBe("provider does not implement listVariables");
	});

	it("fails with the message when the read throws", async () => {
		const { report } = await run(loadedWith(declared), {
			listVariables: async () => {
				throw new Error("403 Forbidden");
			},
		});
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "403 Forbidden" });
	});
});

describe("doctor variables — organization", () => {
	const declared = { org: { A: "1", B: { value: "2", visibility: "private" as const } } };
	const ctx = { org: "acme" };

	it("passes when value and visibility match, a bare string meaning all", async () => {
		const { report } = await run(
			loadedWith(declared),
			{
				listOrgVariables: async (org: string) =>
					org === "acme"
						? { A: { value: "1", visibility: "all" }, B: { value: "2", visibility: "private" } }
						: {},
			},
			ctx
		);
		expect(report.rows[0]).toMatchObject({ id: "org-variables", status: "ok", detail: "2 of 2 match" });
	});

	it("fails on a different value or visibility, and ignores an undeclared selected variable under prune", async () => {
		const { report } = await run(
			loadedWith({ ...declared, prune: true }),
			{
				listOrgVariables: async () => ({
					A: { value: "9", visibility: "all" },
					B: { value: "2", visibility: "all" },
					SEL: { value: "x", visibility: "selected" },
					STRAY: { value: "y", visibility: "all" },
				}),
			},
			ctx
		);
		expect(report.rows[0]!.problems).toEqual([
			'organization variable A: declared "1" (all), found "9" (all)',
			'organization variable B: declared "2" (private), found "2" (all)',
			"unexpected organization variable STRAY",
		]);
	});

	it("treats an object with no visibility as all", async () => {
		const { report } = await run(
			loadedWith({ org: { C: { value: "3" } } }),
			{ listOrgVariables: async () => ({ C: { value: "3", visibility: "all" } }) },
			ctx
		);
		expect(report.rows[0]!.status).toBe("ok");
	});

	it("takes the organization from the repo name when none is given", async () => {
		const listOrgVariables = vi.fn(async () => ({}));
		await run(loadedWith({ org: {}, prune: true }), { listOrgVariables }, {});
		expect(listOrgVariables).toHaveBeenCalledWith("acme");
	});

	it("fails when there is no organization to look under", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({
				name: "demo",
				providers: { source: "github" },
				repo: { variables: declared },
			} as Raw),
			filepath: "/x",
		};
		const { report } = await run(loaded, { listOrgVariables: async () => ({}) }, {});
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "1 problem(s)" });
		expect(report.rows[0]!.problems[0]).toMatch(/no organization/);
	});

	it("skips when the provider cannot list them, or has no token for it", async () => {
		expect((await run(loadedWith(declared), {}, ctx)).report.rows[0]).toMatchObject({
			status: "skip",
			detail: "provider does not implement listOrgVariables",
		});
		const { report } = await run(
			loadedWith(declared),
			{
				listOrgVariables: async () => {
					throw new MissingTokenError("needs the org token");
				},
			},
			ctx
		);
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "needs the org token" });
	});
});

describe("doctor variables — no provider", () => {
	it("skips every declared scope with the reason", async () => {
		const { report, lines } = await run(
			loadedWith({ repo: { A: "1" }, org: { B: "2" } }, { providers: {} }),
			null,
			{ org: "acme" }
		);
		expect(report.rows.map((r) => r.status)).toEqual(["skip", "skip"]);
		expect(report.status).toBe("skip");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 2 skipped");
	});

	it("is ok when one scope passes and the other is skipped", async () => {
		const { report } = await run(
			loadedWith({ repo: { A: "1" }, org: { B: "2" } }),
			{ listVariables: async () => ({ A: "1" }) },
			{ org: "acme" }
		);
		expect(report.status).toBe("ok");
		expect(report.reason).toBeUndefined();
		expect(report.summary).toEqual({ ok: 1, fail: 0, skip: 1 });
	});
});

describe("doctor variables — defaults", () => {
	it("prints to the console and builds its own loader when none is passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorVariables({ loaded: loadedWith(undefined), context: { repoRoot: "/tmp/test" } });
		expect(report.status).toBe("ok");
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});
