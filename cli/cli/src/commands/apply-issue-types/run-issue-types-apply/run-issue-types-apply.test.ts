import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { Issues, PluginLoader } from "../../../plugin/index.js";
import { runIssueTypesApply } from "./run-issue-types-apply.js";
import type { RunIssueTypesApplyInput } from "./run-issue-types-apply.type.js";

const config = (issueTypes?: unknown) =>
	({
		resolved: { providers: {}, name: "demo", issueTypes },
		filepath: "/x",
	}) as unknown as RunIssueTypesApplyInput["loaded"];

const loaderOf = (issues: Partial<Issues> | undefined, failure?: string) =>
	({
		load: async () => {},
		loadedKeys: () => (issues ? ["issues"] : []),
		loadFailures: () => (failure ? [{ key: "issues", provider: "github", error: new Error(failure) }] : []),
		has: () => issues !== undefined,
		get: () => ({ providerName: "github", ...issues }),
	}) as unknown as PluginLoader;

async function run(
	issueTypes: unknown,
	issues: Partial<Issues> | undefined,
	extra: Partial<RunIssueTypesApplyInput> = {},
	failure?: string
) {
	const lines: string[] = [];
	const report = await runIssueTypesApply({
		loaded: config(issueTypes),
		context: { repoRoot: "/x" },
		loader: loaderOf(issues, failure),
		yes: true,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...extra,
	});
	return { report, lines: lines.join("\n") };
}

describe("runIssueTypesApply", () => {
	it("creates the missing Types and prints rows and a summary", async () => {
		const createType = vi.fn(async (t: { name: string }) => ({ id: 1, name: t.name, enabled: true }));
		const { report, lines } = await run([{ name: "Bug" }, { name: "Epic" }], {
			listTypes: async () => [{ id: 7, name: "Bug", enabled: true }],
			createType,
		});
		expect(createType).toHaveBeenCalledWith({ name: "Epic" });
		expect(report).toMatchObject({ status: "ok", created: ["Epic"] });
		expect(lines).toContain("created");
		expect(lines).toContain("2 ok, 0 fail, 0 skipped");
	});

	it("passes --update through to the updates", async () => {
		const updateType = vi.fn(async () => {});
		await run(
			[{ name: "Bug", color: "blue" }],
			{
				listTypes: async () => [{ id: 7, name: "Bug", color: "red", enabled: true }],
				createType: vi.fn(),
				updateType,
			},
			{ update: true }
		);
		expect(updateType).toHaveBeenCalledWith(7, { color: "blue" });
	});

	it("on a dry run reads and writes nothing", async () => {
		const createType = vi.fn();
		const { report, lines } = await run(
			[{ name: "Epic" }],
			{ listTypes: async () => [], createType },
			{ context: { repoRoot: "/x", dryRun: true } }
		);
		expect(createType).not.toHaveBeenCalled();
		expect(report.created).toEqual(["Epic"]);
		expect(lines).toContain("would create");
	});

	it("is a skip with no declaration and loads no provider", async () => {
		const load = vi.fn();
		const { report, lines } = await run(undefined, undefined, { loader: { load } as unknown as PluginLoader });
		expect(load).not.toHaveBeenCalled();
		expect(report.status).toBe("skip");
		expect(lines).toContain("no issueTypes declared");
	});

	it("fails with the reason when the provider did not load", async () => {
		const { report, lines } = await run([{ name: "Epic" }], undefined, {}, "no package");
		expect(report.status).toBe("fail");
		expect(lines).toContain("`github` failed to load: no package");
	});

	it("passes the answer, the terminal and the prompt to the function", async () => {
		const confirm = vi.fn(async () => false);
		const { report } = await run(
			[{ name: "Epic" }],
			{ listTypes: async () => [], createType: vi.fn() },
			{ yes: false, interactive: true, confirm }
		);
		expect(confirm).toHaveBeenCalled();
		expect(report.status).toBe("cancelled");
	});
});
