import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import { textFiles } from "./clone-org.js";
import { findReferences, kindOf } from "./find-references.js";
import type { ScannedRepo } from "./references.type.js";
import { ciProbes } from "./references-probes.js";

const NEEDLE = "acme/.github/.github/";

function repo(name: string, files: Record<string, string>, isTemplate = false): ScannedRepo {
	return { name, isTemplate, files: () => Object.entries(files).map(([path, text]) => ({ path, text })) };
}

const REPOS = [
	repo(".github", { "workflow-templates/test.yml": `uses: ${NEEDLE}workflows/test.yml@main\n` }),
	repo("app", {
		".github/workflows/a.yml": `a\n  uses: ${NEEDLE}workflows/test.yml@main\n  uses: ${NEEDLE}actions/setup@main\n`,
		"README.md": `see ${NEEDLE}\n`,
		"clean.txt": "nothing\n",
	}),
	repo("quiet", { "x.txt": "nothing\n" }, true),
];

function context(args?: string[]) {
	const rows: ProbeRow[] = [];
	const ctx: ProbeContext = {
		...(args ? { args } : {}),
		dryRun: false,
		say: (row) => rows.push(row),
		write: async (_label, fn) => await fn(),
		cleanup: () => {},
		secret: () => {},
	};
	return { ctx, rows };
}

describe("kindOf", () => {
	it("tells a workflow from an action from anything else", () => {
		expect(kindOf(`uses: ${NEEDLE}workflows/x.yml@main`, NEEDLE)).toBe("workflow");
		expect(kindOf(`uses: ${NEEDLE}actions/setup@main`, NEEDLE)).toBe("action");
		expect(kindOf(`see ${NEEDLE}`, NEEDLE)).toBe("other");
	});
});

describe("findReferences", () => {
	it("returns each matching line with its file, line number and kind", () => {
		expect(findReferences(REPOS[1]!, NEEDLE)).toEqual([
			{
				repo: "app",
				file: ".github/workflows/a.yml",
				line: 2,
				kind: "workflow",
				text: `uses: ${NEEDLE}workflows/test.yml@main`,
			},
			{
				repo: "app",
				file: ".github/workflows/a.yml",
				line: 3,
				kind: "action",
				text: `uses: ${NEEDLE}actions/setup@main`,
			},
			{ repo: "app", file: "README.md", line: 1, kind: "other", text: `see ${NEEDLE}` },
		]);
	});

	it("returns nothing for a repository without the text", () => {
		expect(findReferences(REPOS[2]!, NEEDLE)).toEqual([]);
	});
});

describe("ci probes", () => {
	const probes = ciProbes("acme", () => REPOS);

	it("refs counts per repository and separates the host from the callers", async () => {
		const { ctx, rows } = context();
		await probes["refs"]!.run(ctx);
		expect(rows).toEqual([
			{ status: "heading", label: `References to ${NEEDLE}` },
			{ status: "info", label: ".github (host)", detail: "1 files: 1 workflow, 0 action, 0 other" },
			{ status: "info", label: "app", detail: "2 files: 1 workflow, 1 action, 1 other" },
			{ status: "info", label: "quiet", detail: "0 files: 0 workflow, 0 action, 0 other" },
			{ status: "ok", label: "3 outside .github", detail: "1 more inside .github" },
		]);
	});

	it("refs fails above the allowed maximum and passes at it", async () => {
		const over = context(["2"]);
		await probes["refs"]!.run(over.ctx);
		expect(over.rows.at(-1)).toMatchObject({ status: "fail", label: "3 outside .github" });
		const at = context(["3"]);
		await probes["refs"]!.run(at.ctx);
		expect(at.rows.at(-1)).toMatchObject({ status: "ok" });
	});

	it("refs rejects a maximum that is not a number", async () => {
		const { ctx, rows } = context(["lots"]);
		await probes["refs"]!.run(ctx);
		expect(rows).toEqual([{ status: "fail", label: "`lots` is not a number", detail: "usage: ci refs [max]" }]);
	});

	it("ref-list prints every reference", async () => {
		const { ctx, rows } = context();
		await probes["ref-list"]!.run(ctx);
		expect(rows).toHaveLength(5);
		expect(rows[1]).toEqual({
			status: "info",
			label: "app:.github/workflows/a.yml:2",
			detail: `workflow: uses: ${NEEDLE}workflows/test.yml@main`,
		});
		expect(rows.at(-1)).toEqual({ status: "ok", label: "4 references" });
	});

	it("says so when the config has no org", async () => {
		const { ctx, rows } = context();
		await ciProbes(undefined, () => REPOS)["refs"]!.run(ctx);
		expect(rows).toEqual([{ status: "fail", label: "no org", detail: "the config has no org to scan" }]);
		const list = context();
		await ciProbes(undefined, () => REPOS)["ref-list"]!.run(list.ctx);
		expect(list.rows[0]).toMatchObject({ status: "fail", label: "no org" });
	});
});

describe("textFiles", () => {
	it("reads text files and skips .git, node_modules, binaries and large files", () => {
		const root = mkdtempSync(join(tmpdir(), "refs-test-"));
		mkdirSync(join(root, "sub"));
		mkdirSync(join(root, ".git"));
		mkdirSync(join(root, "node_modules"));
		writeFileSync(join(root, "a.txt"), "a");
		writeFileSync(join(root, "sub", "b.txt"), "b");
		writeFileSync(join(root, ".git", "c.txt"), "c");
		writeFileSync(join(root, "node_modules", "d.txt"), "d");
		writeFileSync(join(root, "bin.dat"), Buffer.from([1, 0, 2]));
		writeFileSync(join(root, "big.txt"), Buffer.alloc(5 * 1024 * 1024, "x"));
		const files = [...textFiles(root)].map((f) => f.path).sort();
		rmSync(root, { recursive: true, force: true });
		expect(files).toEqual(["a.txt", join("sub", "b.txt")]);
	});
});
