import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedConfig } from "../../../config/index.js";
import type { ProbeRow } from "../../../plugin/index.js";
import type { GeneratedRepoFile, RepoFileEntry } from "../../repo-files/index.js";
import { generateRepoFiles } from "../../repo-files/index.js";
import { checkGenerated } from "./check-generated.js";
import { generatePackageWorkflows } from "./generate-package-workflows.js";
import { generatedProbes } from "./generated-probes.js";
import { sharedWorkflows } from "./shared-workflows.js";

vi.mock("./generate-package-workflows.js", () => ({
	generatePackageWorkflows: vi.fn(async () => ({ packages: [], errors: [] })),
}));

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
			]),
		});
		expect(problems.map((p) => p.split(":")[0])).toEqual([
			".github/workflows/stale.yml",
			".github/workflows/old.yml",
			".github/workflows/plain.yml",
			".github/workflows/app.yml",
		]);
		expect(problems[0]).toContain('not marked "# HAND-MAINTAINED"');
	});
});

describe("checkGenerated for a workspace package", () => {
	const app = (content: string) => file(".github/workflows/ci.deploy-preview.yml", content);
	const packages = (content: string, again = content) => [
		{ path: "apps/sentinel", files: [app(content)], again: [app(again)] },
	];
	const committed = (text: string | null) => (path: string) => (path.endsWith("ci.deploy-preview.yml") ? text : null);

	it("passes a package workflow that matches, and accounts for the committed file", () => {
		expect(
			checkGenerated({
				files: [],
				again: [],
				packages: packages("paths: a\n"),
				read: committed("paths: a\n"),
				workflows: new Map([["ci.deploy-preview.yml", "# AUTO-GENERATED\n# Source package: apps/sentinel\n"]]),
			})
		).toEqual([]);
	});

	it("names the package and the command when its workflow differs or is missing", () => {
		const run = (text: string | null) =>
			checkGenerated({
				files: [],
				again: [],
				packages: packages("paths: new\n"),
				read: committed(text),
				workflows: NONE,
			});
		expect(run("paths: old\n")).toEqual([
			'.github/workflows/ci.deploy-preview.yml: differs from what holocron generates for package apps/sentinel (first difference at line 1: committed "paths: old", generated "paths: new"); run `holocron sync --cwd apps/sentinel` and commit the result',
		]);
		expect(run(null)).toEqual([
			".github/workflows/ci.deploy-preview.yml: missing for package apps/sentinel; run `holocron sync --cwd apps/sentinel` and commit it",
		]);
	});

	it("reports a package workflow whose second generation differs", () => {
		expect(
			checkGenerated({
				files: [],
				again: [],
				packages: packages("a\n", "b\n"),
				read: committed("a\n"),
				workflows: NONE,
			})
		).toEqual([".github/workflows/ci.deploy-preview.yml: generating it twice gives different content"]);
	});

	it("checks a file two configs both write once, as the root's, and leaves a hand-maintained workflow alone", () => {
		const root = [app("root\n")];
		expect(
			checkGenerated({
				files: root,
				again: root,
				packages: packages("package\n"),
				read: committed("root\n"),
				workflows: new Map([["mine.yml", "# HAND-MAINTAINED\n# Source package: apps/sentinel\n"]]),
			})
		).toEqual([]);
	});

	it("flags a workflow from a package whose config no longer generates it", () => {
		expect(
			checkGenerated({
				files: [],
				again: [],
				packages: [{ path: "apps/sentinel", files: [], again: [] }],
				read: () => null,
				workflows: new Map([["gone.yml", "# AUTO-GENERATED\n# Source package: apps/sentinel\n"]]),
			})
		).toEqual([expect.stringMatching(/^\.github\/workflows\/gone\.yml: no task generates it/)]);
	});
});

describe("sharedWorkflows", () => {
	it("says nothing when every package writes its own files", () => {
		expect(
			sharedWorkflows([file("a.yml", "x")], [{ path: "apps/x", files: [file("b.yml", "x")], again: [] }])
		).toEqual([]);
	});

	it("names the owner of a file a package shares, root first and then an earlier package", () => {
		const lines = sharedWorkflows(
			[file("a.yml", "x")],
			[
				{ path: "apps/x", files: [file("a.yml", "y"), file("b.yml", "y")], again: [] },
				{ path: "apps/y", files: [file("b.yml", "z")], again: [] },
			]
		);
		expect(lines).toEqual([
			"package apps/x also generates 1 workflow(s) that another config writes, only that copy is checked (a.yml, from the root config, is one)",
			"package apps/y also generates 1 workflow(s) that another config writes, only that copy is checked (b.yml, from package apps/x, is one)",
		]);
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

	it("checks the workflows of a package's own config, and reports one it could not load and one it shares", async () => {
		writeFileSync(join(root, ".github", "workflows", "ci.app.yml"), "# AUTO-GENERATED\n# Source package: apps/x\n");
		vi.mocked(generatePackageWorkflows).mockResolvedValueOnce({
			packages: [
				{
					path: "apps/x",
					files: [file(".github/workflows/ci.app.yml", "new\n"), file("a.json", "{}\n")],
					again: [file(".github/workflows/ci.app.yml", "new\n"), file("a.json", "{}\n")],
				},
			],
			errors: ["apps/y: could not generate its workflows: boom"],
		});
		const rows = await run([file("a.json", "{}\n")]);
		expect(rows).toEqual([
			{ status: "fail", label: "apps/y: could not generate its workflows: boom" },
			{
				status: "fail",
				label: expect.stringMatching(
					/^\.github\/workflows\/ci\.app\.yml: differs from what holocron generates for package apps\/x/
				),
			},
			{ status: "info", label: expect.stringMatching(/^package apps\/x also generates 1 workflow/) },
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
