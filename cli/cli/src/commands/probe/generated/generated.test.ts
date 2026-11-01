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
				["ci.platform.syncTemplates.yml", "# AUTO-GENERATED — do not edit directly.\n"],
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

	async function run(entries: RepoFileEntry[], second: RepoFileEntry[] = entries): Promise<ProbeRow[]> {
		generate.mockResolvedValueOnce(entries).mockResolvedValueOnce(second);
		const rows: ProbeRow[] = [];
		await generatedProbes({} as LoadedConfig, root).check!.run({ say: (row: ProbeRow) => rows.push(row) } as never);
		return rows;
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
});
