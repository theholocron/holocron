import { describe, expect, it, vi } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import type { DocsPresenceIo } from "./docs-presence.type.js";
import { docsPresenceProbe } from "./docs-presence-probe.js";

function makeCtx(): { ctx: ProbeContext; rows: ProbeRow[] } {
	const rows: ProbeRow[] = [];
	const ctx = { dryRun: false, say: (row: ProbeRow) => rows.push(row) } as unknown as ProbeContext;
	return { ctx, rows };
}

const packages: Record<string, { private?: boolean }> = {
	"utils/array-utils": {},
	"clients/axiom-client": {},
	"apps/sentinel": { private: true },
};

function makeIo(overrides: Partial<DocsPresenceIo> = {}): DocsPresenceIo {
	return {
		env: {},
		addedFiles: () => [],
		changedFiles: () => [],
		subjects: () => [],
		messages: () => "",
		diffOf: () => "",
		readPackage: (dir) => packages[dir],
		...overrides,
	};
}

async function run(io: DocsPresenceIo): Promise<ProbeRow[]> {
	const { ctx, rows } = makeCtx();
	await docsPresenceProbe(io).run(ctx);
	return rows;
}

const labels = (rows: ProbeRow[]): string[] => rows.map((r) => `${r.status}: ${r.label}`);

describe("docsPresenceProbe", () => {
	it("is a probe that writes nothing", () => {
		const probe = docsPresenceProbe(makeIo());
		expect(probe.writes).toBe(false);
		expect(probe.summary).toMatch(/never fails/);
	});

	it("diffs against BASE_SHA, or HEAD~1 without it", async () => {
		const addedFiles = vi.fn(() => []);
		await run(makeIo({ addedFiles }));
		expect(addedFiles).toHaveBeenLastCalledWith("HEAD~1");
		await run(makeIo({ addedFiles, env: { BASE_SHA: "abc123" } }));
		expect(addedFiles).toHaveBeenLastCalledWith("abc123");
	});

	it("skips quietly when git cannot say what changed", async () => {
		const rows = await run(
			makeIo({
				addedFiles: () => {
					throw new Error("no base");
				},
			})
		);
		expect(rows).toEqual([
			{ status: "info", label: "docs presence", detail: "could not determine the changed files; skipped" },
		]);
	});

	it("is quiet when nothing was added and there is no feat", async () => {
		expect(labels(await run(makeIo()))).toEqual(["heading: Docs presence", "ok: new packages", "ok: feature docs"]);
	});

	it("warns about a new public package with no docs change, and ignores a private one or a node_modules one", async () => {
		const rows = await run(
			makeIo({
				addedFiles: () => [
					"utils/array-utils/src/index.ts",
					"apps/sentinel/src/index.ts",
					"clients/missing/src/index.ts",
					"x/node_modules/y/src/index.ts",
					"README.md",
				],
				changedFiles: () => ["utils/array-utils/src/index.ts"],
			})
		);
		const row = rows.find((r) => r.label === "new packages without docs");
		expect(row?.status).toBe("info");
		expect(row?.detail).toMatch(/^array-utils: /);
	});

	it("is satisfied by a docs change next to a new package", async () => {
		const rows = await run(
			makeIo({
				addedFiles: () => ["utils/array-utils/src/index.ts"],
				changedFiles: () => ["utils/array-utils/src/index.ts", "docs/src/content/docs/utils/array-utils.mdx"],
			})
		);
		expect(rows.find((r) => r.label === "new packages")).toMatchObject({ status: "ok" });
		expect(rows.find((r) => r.label === "new packages")?.detail).toMatch(/a docs change is in the PR/);
	});

	it("reads a feat from the PR title as well as the commit subjects", async () => {
		const fromTitle = await run(
			makeIo({ env: { PR_TITLE: "feat(utils): x" }, changedFiles: () => ["utils/array-utils/src/a.ts"] })
		);
		expect(labels(fromTitle)).toContain("info: warning: utils/array-utils");
		const fromCommit = await run(
			makeIo({ subjects: () => ["feat: x"], changedFiles: () => ["utils/array-utils/src/a.ts"] })
		);
		expect(labels(fromCommit)).toContain("info: warning: utils/array-utils");
	});

	it("says so when a feat changes no public package source", async () => {
		const rows = await run(
			makeIo({ subjects: () => ["feat: x"], changedFiles: () => ["apps/sentinel/src/a.ts", "scripts/x.mjs"] })
		);
		expect(rows.at(-1)).toMatchObject({ status: "ok", detail: "a feat, but no public package source changed" });
	});

	it("warns, naming the package and the marker, when a feat has no docs signal", async () => {
		const rows = await run(
			makeIo({ subjects: () => ["feat(utils): x"], changedFiles: () => ["utils/array-utils/src/a.ts"] })
		);
		const warning = rows.find((r) => r.label === "warning: utils/array-utils");
		expect(warning?.status).toBe("info");
		expect(warning?.detail).toMatch(/\[skip docs\] <reason>/);
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("is satisfied by a doc comment added to the package's source", async () => {
		const diffOf = vi.fn(() => "+/** Documented. */\n+export const x = 1;\n");
		const rows = await run(
			makeIo({ subjects: () => ["feat: x"], changedFiles: () => ["utils/array-utils/src/a.ts"], diffOf })
		);
		expect(diffOf).toHaveBeenCalledWith("HEAD~1", "utils/array-utils");
		expect(rows.at(-1)).toMatchObject({ status: "ok", label: "feature docs" });
	});

	it("is excused by a [skip docs] reason in a commit message, and quotes it", async () => {
		const rows = await run(
			makeIo({
				subjects: () => ["feat: x"],
				changedFiles: () => ["utils/array-utils/src/a.ts"],
				messages: () => "feat: x\n\n[skip docs] internal constant, nothing to document",
			})
		);
		expect(rows.find((r) => r.label === "skipped utils/array-utils")).toMatchObject({
			detail: "[skip docs] internal constant, nothing to document",
		});
		expect(rows.at(-1)).toMatchObject({ status: "ok", label: "feature docs" });
	});

	it("reads a scoped marker from the PR description", async () => {
		const rows = await run(
			makeIo({
				env: { PR_BODY: "[skip docs: array-utils] covered elsewhere" },
				subjects: () => ["feat: x"],
				changedFiles: () => ["utils/array-utils/src/a.ts"],
			})
		);
		expect(labels(rows)).toContain("info: skipped utils/array-utils");
	});

	it("keeps warning, and says why, when the marker has no reason", async () => {
		const rows = await run(
			makeIo({
				subjects: () => ["feat: x"],
				changedFiles: () => ["utils/array-utils/src/a.ts"],
				messages: () => "[skip docs]",
			})
		);
		expect(labels(rows)).toContain("info: warning: utils/array-utils");
		expect(rows.find((r) => r.label === "[skip docs]")?.detail).toMatch(/no reason/);
	});
});
