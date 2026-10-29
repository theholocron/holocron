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

function context(dryRun = false) {
	const rows: ProbeRow[] = [];
	const ctx: ProbeContext = {
		dryRun,
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
