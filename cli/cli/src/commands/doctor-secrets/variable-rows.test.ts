import { stripVTControlCharacters } from "node:util";

import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { variableRows } from "./variable-rows.js";

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
	const loader = loaderWith(loaded, source, context);
	await loader.load();
	const org = context.org ?? (context.repo ?? loaded.resolved.repo?.name ?? "").split("/")[0];
	const result = await variableRows(loader, loaded.resolved, org);
	const rows: CheckRow[] = result.declared
		? result.rows
		: [{ id: "variables", title: "variables", status: "ok", detail: "none declared", problems: [] }];
	printCheckRows(rows, (l) => lines.push(stripVTControlCharacters(l)));
	const summary = summariseChecks(rows);
	printCheckSummary(summary, (l) => lines.push(stripVTControlCharacters(l)));
	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	const report = {
		status,
		summary,
		rows,
		observations: result.observations,
		reason: status === "skip" ? rows.map((r) => r.detail).join("; ") : undefined,
	};
	return { report, lines };
}

describe("variable rows — what is declared", () => {
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

describe("variable rows — repository", () => {
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

describe("variable rows — organization", () => {
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

describe("variable rows — no provider", () => {
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

describe("variable rows — repo.variables.sync", () => {
	const sync = (extra: Record<string, unknown> = {}) => ({
		sync: [{ environment: "Vars", scope: "org=acme", keys: ["TURBO_TEAM", "AXIOM_DATASET"], ...extra }],
	});

	it("passes when every listed name exists at the scope, whatever its case, and shows no value", async () => {
		const { report, lines } = await run(loadedWith(sync()), {
			listOrgVariables: async () => ({
				turbo_team: { value: "secret-looking-value", visibility: "all" },
				AXIOM_DATASET: { value: "x", visibility: "all" },
			}),
		});
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({
			title: "acme organization variables from Vars exist",
			status: "ok",
			detail: "2 of 2 match",
		});
		expect(lines.join("\n")).not.toContain("secret-looking-value");
	});

	it("names each missing variable and a visibility that differs from the one declared", async () => {
		const { report } = await run(loadedWith(sync({ visibility: "private" })), {
			listOrgVariables: async () => ({ TURBO_TEAM: { value: "v", visibility: "all" } }),
		});
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.problems).toEqual([
			"organization variable TURBO_TEAM: declared visibility private, found visibility all",
			"missing organization variable AXIOM_DATASET",
		]);
	});

	it("checks a repository entry with listVariables, and an extra variable is not a problem", async () => {
		const loaded = loadedWith({ sync: [{ environment: "Vars", keys: ["A", "B"] }] });
		const bad = await run(loaded, { listVariables: async () => ({ A: "1", EXTRA: "z" }) });
		expect(bad.report.rows[0]).toMatchObject({ title: "repository variables from Vars exist", status: "fail" });
		expect(bad.report.rows[0]!.problems).toEqual(["missing variable B"]);
		const good = await run(loaded, { listVariables: async () => ({ a: "1", B: "2", EXTRA: "z" }) });
		expect(good.report.status).toBe("ok");
	});

	it("skips with the reason when the provider cannot list at that scope", async () => {
		const org = await run(loadedWith(sync()), {});
		expect(org.report.rows[0]).toMatchObject({
			status: "skip",
			detail: "provider does not implement listOrgVariables",
		});
		const repo = await run(loadedWith({ sync: [{ environment: "Vars", keys: ["A"] }] }), {});
		expect(repo.report.rows[0]).toMatchObject({
			status: "skip",
			detail: "provider does not implement listVariables",
		});
	});
});
