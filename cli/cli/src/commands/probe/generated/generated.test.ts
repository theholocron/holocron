import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedConfig } from "../../../config/index.js";
import type { ProbeRow } from "../../../plugin/index.js";
import type { GeneratedRepoFile, RepoFileEntry } from "../../repo-files/index.js";
import { generateRepoFiles } from "../../repo-files/index.js";
import { checkGenerated } from "./check-generated.js";
import { generatedProbes } from "./generated-probes.js";

vi.mock("../../repo-files/index.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../repo-files/index.js")>()),
	generateRepoFiles: vi.fn(),
}));

function file(path: string, content: string): GeneratedRepoFile {
	return { kind: "file", path, content, step: `write ${path}`, syncStep: `sync ${path}` };
}

const NONE = new Map<string, string>();

describe("checkGenerated", () => {
	const files = [file("a.json", "{}\n"), file(".github/workflows/x.yml", "x\n")];

	it("passes when every file matches, twice, and every workflow is accounted for", () => {
		expect(
			checkGenerated({
				files,
				again: files,
				read: (path) => files.find((f) => f.path === path)?.content ?? null,
				workflows: new Map([["x.yml", "x\n"]]),
			})
		).toEqual([]);
	});

	it("reports a file that is missing and one that differs", () => {
		const problems = checkGenerated({
			files,
			again: files,
			read: (path) => (path === "a.json" ? "{ }\n" : null),
			workflows: NONE,
		});
		expect(problems).toHaveLength(2);
		expect(problems[0]).toMatch(/^a\.json: differs from what holocron generates/);
		expect(problems[0]).toContain('first difference at line 1: committed "{ }", generated "{}"');
		expect(problems[1]).toMatch(/^\.github\/workflows\/x\.yml: missing/);
	});

	it("names the line where a longer or shorter committed file first differs", () => {
		const generated = [file("a.txt", "one\ntwo\n")];
		const run = (committed: string) =>
			checkGenerated({ files: generated, again: generated, read: () => committed, workflows: NONE })[0];
		expect(run("one\ntwo\nthree\n")).toContain('first difference at line 3: committed "three", generated ""');
		expect(run("one\n")).toContain('first difference at line 2: committed "", generated "two"');
		expect(run("one\ntwo")).toContain('first difference at line 3: committed (end of file), generated ""');
	});

	it("reports a file whose second generation differs, or is absent", () => {
		const read = (path: string) => files.find((f) => f.path === path)?.content ?? null;
		const problems = checkGenerated({
			files,
			again: [file("a.json", "{ }\n")],
			read,
			workflows: NONE,
		});
		expect(problems).toEqual([
			"a.json: generating it twice gives different content",
			".github/workflows/x.yml: generating it twice gives different content",
		]);
	});

	it("flags a workflow nothing generates, and lets through the ones that are someone else's", () => {
		const problems = checkGenerated({
			files: [],
			again: [],
			read: () => null,
			workflows: new Map([
				["stale.yml", "# AUTO-GENERATED — do not edit directly.\n# Source package: .\n"],
				["old.yml", "# AUTO-GENERATED — do not edit directly.\n"],
				["plain.yml", "name: x\n"],
				["mine.yml", "# HAND-MAINTAINED — edit directly.\n"],
				["app.yml", "# AUTO-GENERATED — do not edit directly.\n# Source package: apps/sentinel\n"],
				["ci.sync-templates.yml", "# AUTO-GENERATED — do not edit directly.\n"],
			]),
		});
		expect(problems.map((p) => p.split(":")[0])).toEqual([
			".github/workflows/stale.yml",
			".github/workflows/old.yml",
			".github/workflows/plain.yml",
		]);
		expect(problems[0]).toContain('not marked "# HAND-MAINTAINED"');
	});
});

describe("generatedProbes", () => {
	let root: string;
	const generate = vi.mocked(generateRepoFiles);

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "generated-probe-"));
		mkdirSync(join(root, ".github", "workflows"), { recursive: true });
		writeFileSync(join(root, "a.json"), "{}\n");
		writeFileSync(join(root, ".github", "workflows", "keep.yml"), "# HAND-MAINTAINED\n");
		writeFileSync(join(root, ".github", "workflows", "notes.txt"), "not a workflow\n");
	});
	afterEach(() => {
		generate.mockReset();
		rmSync(root, { recursive: true, force: true });
	});

	async function run(
		entries: RepoFileEntry[],
		second: RepoFileEntry[] = entries,
		resolved: Record<string, unknown> = { tasks: [] }
	): Promise<ProbeRow[]> {
		generate.mockResolvedValueOnce(entries).mockResolvedValueOnce(second);
		const rows: ProbeRow[] = [];
		await generatedProbes({ resolved } as unknown as LoadedConfig, root).check!.run({
			say: (row: ProbeRow) => rows.push(row),
		} as never);
		return rows;
	}

	/** A workspace with a root `package.json` and one package, so the scripts can be checked. */
	function workspace(rootScripts: Record<string, string>, packageScripts: Record<string, string>) {
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", scripts: rootScripts }));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - utils/*\n");
		mkdirSync(join(root, "utils", "a"), { recursive: true });
		writeFileSync(
			join(root, "utils", "a", "package.json"),
			JSON.stringify({ name: "@x/a", scripts: packageScripts })
		);
	}

	it("says how many files match", async () => {
		const rows = await run([
			file("a.json", "{}\n"),
			{ kind: "skip", step: "write codecov.yml", syncStep: "write codecov.yml", message: "no test workflow" },
		]);
		expect(rows).toEqual([{ status: "ok", label: "1 files", detail: "all match what holocron generates" }]);
	});

	it("fails for a file that differs, a file that cannot be generated and a workflow nothing generates", async () => {
		writeFileSync(join(root, ".github", "workflows", "stale.yml"), "name: x\n");
		const rows = await run([
			file("a.json", "{ }\n"),
			file("gone.json", "{}\n"),
			{ kind: "error", step: "write codecov.yml", syncStep: "write codecov.yml", message: "bad yaml" },
		]);
		expect(rows.every((r) => r.status === "fail")).toBe(true);
		expect(rows.map((r) => r.label)).toEqual([
			"write codecov.yml: bad yaml",
			expect.stringMatching(/^a\.json: differs/),
			expect.stringMatching(/^gone\.json: missing/),
			expect.stringMatching(/^\.github\/workflows\/stale\.yml: no task generates it/),
		]);
	});

	it("fails when the second generation is not the first", async () => {
		const rows = await run([file("a.json", "{}\n")], [file("a.json", "{ }\n")]);
		expect(rows).toEqual([{ status: "fail", label: "a.json: generating it twice gives different content" }]);
	});

	describe("scripts", () => {
		const entries = [file("a.json", "{}\n")];
		const tasks = ["build", "test:unit", "lint:markdown"];

		it("fails for a root script that differs from what holocron generates, and for one that is missing", async () => {
			workspace({ build: "tsdown", holocron: "holocron" }, {});
			const rows = await run(entries, entries, { tasks, holocronScript: "holocron" });
			expect(rows.map((r) => r.label)).toEqual([
				expect.stringMatching(/^package\.json: script "lint" is missing, holocron generates "turbo run lint"/),
				expect.stringMatching(
					/^package\.json: script "lint:markdown" is missing, holocron generates "markdownlint-cli2 /
				),
				expect.stringMatching(/^package\.json: script "test" is missing, holocron generates "turbo run test"/),
				expect.stringMatching(/^package\.json: script "test:unit" is missing/),
			]);
			expect(rows.every((r) => r.status === "fail")).toBe(true);
		});

		it("prints a differing script as it is", async () => {
			workspace(
				{
					build: "turbo run build",
					holocron: "holocron",
					"lint:markdown": "markdownlint .",
					test: "turbo run test",
					lint: "turbo run lint",
					"test:unit": "turbo run test:unit",
				},
				{}
			);
			const rows = await run(entries, entries, { tasks, holocronScript: "holocron" });
			expect(rows).toEqual([
				expect.objectContaining({
					status: "fail",
					label: expect.stringMatching(/script "lint:markdown" is "markdownlint \.", holocron generates/),
				}),
			]);
		});

		it("fails for a package script that breaks a rule and only says so for a deprecated name", async () => {
			workspace(
				{
					build: "turbo run build",
					holocron: "holocron",
					"lint:markdown": 'markdownlint-cli2 "**/*.md"',
					test: "turbo run test",
					lint: "turbo run lint",
					"test:unit": "turbo run test:unit",
				},
				{ test: "vitest", "verification.unitTests": "vitest run" }
			);
			const rows = await run(entries, entries, { tasks, holocronScript: "holocron" });
			expect(rows).toEqual([
				{ status: "fail", label: expect.stringMatching(/^utils\/a\/package\.json: "test" is a suite/) },
				{
					status: "info",
					label: "deprecated task names still used as scripts in 1 package.json file(s), for example utils/a/package.json (verification.unitTests): rename them to flat ids",
				},
			]);
		});

		it("does not compare the root's scripts when syncScripts is off, but still checks the rules", async () => {
			workspace({ publish: "x" }, {});
			const rows = await run(entries, entries, { tasks, syncScripts: false });
			expect(rows.map((r) => r.label)).toEqual([
				expect.stringMatching(/^package\.json: "publish" is a name npm and pnpm/),
			]);
		});

		it("reads a package that has no scripts at all as having none", async () => {
			workspace({ holocron: "holocron" }, {});
			writeFileSync(join(root, "utils", "a", "package.json"), JSON.stringify({ name: "@x/a" }));
			expect(await run(entries, entries, { tasks: [], holocronScript: "holocron" })).toEqual([
				{ status: "ok", label: "1 files", detail: "all match what holocron generates" },
			]);
		});

		it("passes with nothing to check when the checkout has no package.json", async () => {
			expect(await run(entries)).toEqual([
				{ status: "ok", label: "1 files", detail: "all match what holocron generates" },
			]);
		});
	});
});
