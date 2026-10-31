import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import { docsCoverageProbes } from "./docs-coverage-probes.js";

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), "docs-probe-"));
	writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "libs/*"\n');
	mkdirSync(join(root, "libs/a/src"), { recursive: true });
	writeFileSync(join(root, "libs/a/package.json"), JSON.stringify({ name: "@s/a" }));
	writeFileSync(join(root, "libs/a/src/index.ts"), "");
	return root;
}

const TYPEDOC = () => ({
	children: [
		{
			name: "one",
			kind: 64,
			signatures: [{ comment: { summary: [{}] }, sources: [{ fileName: "libs/a/src/index.ts", line: 4 }] }],
		},
		{ name: "two", kind: 64, signatures: [{ sources: [{ fileName: "libs/a/src/index.ts", line: 8 }] }] },
	],
});

function context(dryRun = false, lcov?: string) {
	const rows: ProbeRow[] = [];
	const ctx: ProbeContext = {
		dryRun,
		...(lcov ? { lcov } : {}),
		say: (row) => rows.push(row),
		write: async (_label, fn) => (dryRun ? undefined : await fn()),
		cleanup: () => {},
		secret: () => {},
	};
	return { ctx, rows };
}

describe("docs coverage probes", () => {
	it("coverage lists each package's documented share and the total", async () => {
		const probes = docsCoverageProbes(repo(), vi.fn(TYPEDOC));
		const { ctx, rows } = context();
		await probes["coverage"]!.run(ctx);
		expect(rows).toEqual([
			{ status: "heading", label: "Documented exports" },
			{ status: "info", label: "libs/a", detail: "1/2 (50%)" },
			{ status: "info", label: "total", detail: "1/2 (50%)" },
		]);
		expect(probes["coverage"]!.writes).toBe(false);
	});

	it("reports ok and 100% when everything is documented, and for a package with no symbols", async () => {
		const probes = docsCoverageProbes(repo(), () => ({ children: [] }));
		const { ctx, rows } = context();
		await probes["coverage"]!.run(ctx);
		expect(rows.at(-1)).toEqual({ status: "ok", label: "total", detail: "0/0 (100%)" });
	});

	it("lcov writes coverage/docs.lcov and still reports", async () => {
		const root = repo();
		const probes = docsCoverageProbes(root, vi.fn(TYPEDOC));
		const { ctx, rows } = context();
		await probes["lcov"]!.run(ctx);
		expect(readFileSync(join(root, "coverage/docs.lcov"), "utf8")).toContain(
			"SF:libs/a/src/index.ts\nDA:4,1\nDA:8,0"
		);
		expect(rows.at(-1)?.label).toBe("total");
		expect(probes["lcov"]!.writes).toBe(true);
	});

	it("lcov on a dry run writes nothing", async () => {
		const root = repo();
		const probes = docsCoverageProbes(root, vi.fn(TYPEDOC));
		const { ctx } = context(true);
		await probes["lcov"]!.run(ctx);
		expect(() => readFileSync(join(root, "coverage/docs.lcov"), "utf8")).toThrow();
	});
});

describe("--lcov", () => {
	it("coverage also writes the report to the path it is given, and says so", async () => {
		const root = repo();
		const probes = docsCoverageProbes(root, vi.fn(TYPEDOC));
		const { ctx, rows } = context(false, "out/nested/docs.lcov");
		await probes["coverage"]!.run(ctx);
		expect(readFileSync(join(root, "out/nested/docs.lcov"), "utf8")).toContain(
			"SF:libs/a/src/index.ts\nDA:4,1\nDA:8,0"
		);
		expect(rows).toContainEqual({ status: "info", label: "lcov", detail: "wrote out/nested/docs.lcov" });
		expect(rows.at(-1)).toEqual({ status: "info", label: "total", detail: "1/2 (50%)" });
		expect(probes["coverage"]!.writes).toBe(false);
	});

	it("writes nothing on a dry run, and only says what it would write", async () => {
		const root = repo();
		const probes = docsCoverageProbes(root, vi.fn(TYPEDOC));
		const { ctx, rows } = context(true, "docs.lcov");
		await probes["coverage"]!.run(ctx);
		expect(() => readFileSync(join(root, "docs.lcov"), "utf8")).toThrow();
		expect(rows).toContainEqual({ status: "info", label: "lcov", detail: "would write docs.lcov" });
	});

	it("writes no file when the flag is not given", async () => {
		const root = repo();
		const { ctx, rows } = context();
		await docsCoverageProbes(root, vi.fn(TYPEDOC))["coverage"]!.run(ctx);
		expect(rows.some((row) => row.label === "lcov")).toBe(false);
	});

	it("patch measures every package for the report, and still gates on the lines the PR changed", async () => {
		const root = repo();
		const typedoc = vi.fn(TYPEDOC);
		const probes = docsCoverageProbes(root, typedoc, () => "+++ b/elsewhere/x.ts\n@@ -0,0 +1,1 @@");
		const { ctx, rows } = context(false, "docs.lcov");
		await probes["patch"]!.run(ctx);
		expect(typedoc).toHaveBeenCalledOnce();
		expect(readFileSync(join(root, "docs.lcov"), "utf8")).toContain("DA:8,0");
		expect(rows.at(-1)).toEqual({ status: "ok", label: "0 checked", detail: "every one has a doc comment" });
	});

	it("patch still fails on an undocumented export when it writes the report", async () => {
		const probes = docsCoverageProbes(repo(), vi.fn(TYPEDOC), () => "+++ b/libs/a/src/index.ts\n@@ -0,0 +8,1 @@");
		const { ctx, rows } = context(false, "docs.lcov");
		await probes["patch"]!.run(ctx);
		expect(rows).toContainEqual({
			status: "fail",
			label: "libs/a/src/index.ts:8",
			detail: "Function two has no doc comment",
		});
	});
});

describe("docs patch probe", () => {
	const run = async (diff: string, typedoc = TYPEDOC) => {
		const probes = docsCoverageProbes(repo(), vi.fn(typedoc), () => diff);
		const { ctx, rows } = context();
		await probes["patch"]!.run(ctx);
		return rows;
	};
	const hunk = (file: string, start: number, count = 1) => `+++ b/${file}\n@@ -0,0 +${start},${count} @@`;

	it("fails for each undocumented export on an added line", async () => {
		const rows = await run(hunk("libs/a/src/index.ts", 8));
		expect(rows).toEqual([
			{ status: "heading", label: "Exports this PR adds or changes" },
			{ status: "fail", label: "libs/a/src/index.ts:8", detail: "Function two has no doc comment" },
		]);
	});

	it("passes when the changed exports are documented", async () => {
		const rows = await run(hunk("libs/a/src/index.ts", 4));
		expect(rows.at(-1)).toEqual({ status: "ok", label: "1 checked", detail: "every one has a doc comment" });
	});

	it("does not measure a package the PR does not touch, and passes with nothing to check", async () => {
		const typedoc = vi.fn(TYPEDOC);
		const probes = docsCoverageProbes(repo(), typedoc, () => hunk("elsewhere/x.ts", 1));
		const { ctx, rows } = context();
		await probes["patch"]!.run(ctx);
		expect(typedoc).not.toHaveBeenCalled();
		expect(rows.at(-1)).toEqual({ status: "ok", label: "0 checked", detail: "every one has a doc comment" });
	});
});
