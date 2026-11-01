import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import type { SpecsIo } from "./specs.type.js";
import { SPECS_PROVIDER, specsCheckProbe, specsProbes } from "./specs-probe.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const GOOD_ADR = md(
	"---",
	"id: ADR-0009",
	"title: Task manifest",
	"status: accepted",
	"date: 2026-05-01",
	"discussion:",
	"  github: https://github.com/o/r/pull/1",
	"---"
);
const GOOD_SPEC = md("---", "status: draft", "issue: theholocron/holocron#1", "---");

/** An in-memory repo: path to text. A folder is the files that start with `<dir>/` and have no further `/`. */
function makeIo(files: Record<string, string>): SpecsIo {
	return {
		list: (dir) =>
			Object.keys(files)
				.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes("/"))
				.map((f) => f.slice(dir.length + 1)),
		read: (path) => files[path],
		repoPath: (arg) => arg.replace(/^\.\//, ""),
	};
}

async function run(io: SpecsIo, args?: string[]): Promise<ProbeRow[]> {
	const rows: ProbeRow[] = [];
	const ctx = { dryRun: false, args, say: (row: ProbeRow) => rows.push(row) } as unknown as ProbeContext;
	await specsCheckProbe(io).run(ctx);
	return rows;
}

const labels = (rows: ProbeRow[]): string[] => rows.map((r) => `${r.status}: ${r.label}`);

describe("specsProbes", () => {
	it("is the specs group with one probe, which writes nothing", () => {
		expect(SPECS_PROVIDER).toBe("specs");
		const probes = specsProbes(makeIo({}));
		expect(Object.keys(probes)).toEqual(["check"]);
		expect(probes["check"]!.writes).toBe(false);
		expect(probes["check"]!.summary).toMatch(/frontmatter/);
	});
});

describe("specsCheckProbe", () => {
	it("passes the whole tree when every ADR and spec is well formed", async () => {
		const rows = await run(
			makeIo({
				"docs/wiki/decisions/0009-task-manifest.md": GOOD_ADR,
				"docs/wiki/decisions/template.md": "no frontmatter",
				"docs/wiki/decisions/README.md": "no frontmatter",
				".notes/tech-x.spec.md": GOOD_SPEC,
				".notes/README.md": "no frontmatter",
				"docs/wiki/specifications/tool-y.spec.md": GOOD_SPEC,
			})
		);
		expect(rows).toEqual([
			{ status: "heading", label: "ADRs and specs" },
			{ status: "ok", label: "frontmatter", detail: "3 file(s) checked, 0 error(s), 0 warning(s)" },
		]);
	});

	it("is happy with a repo that has none of the folders", async () => {
		expect((await run(makeIo({}))).at(-1)).toMatchObject({
			status: "ok",
			detail: "0 file(s) checked, 0 error(s), 0 warning(s)",
		});
	});

	it("fails a row for each error, with the file, line, reason and rule", async () => {
		const rows = await run(
			makeIo({
				"docs/wiki/decisions/0009-task-manifest.md": GOOD_ADR.replace("ADR-0009", "ADR-0010"),
				".notes/tech-x.spec.md": md("---", "status: shipped", "issue: x#1", "---"),
			})
		);
		expect(rows.filter((r) => r.status === "fail")).toEqual([
			{
				status: "fail",
				label: "docs/wiki/decisions/0009-task-manifest.md:2",
				detail: 'id "ADR-0010" does not match filename sequence (expected ADR-0009) [id]',
			},
			{
				status: "fail",
				label: ".notes/tech-x.spec.md:2",
				detail: 'invalid status "shipped" — must be one of: draft, proposed, accepted, archived, superseded [status]',
			},
		]);
		expect(rows.at(-1)).toMatchObject({ status: "info", detail: "2 file(s) checked, 2 error(s), 0 warning(s)" });
	});

	it("reports a warning as an info row and still passes", async () => {
		const rows = await run(makeIo({ ".notes/tech-x.spec.md": md("---", "status: draft", "---") }));
		expect(labels(rows)).toEqual(["heading: ADRs and specs", "info: .notes/tech-x.spec.md:1", "ok: frontmatter"]);
		expect(rows[1]?.detail).toMatch(/missing `issue` field.*\[issue\]/);
		expect(rows.at(-1)?.detail).toBe("1 file(s) checked, 0 error(s), 1 warning(s)");
	});

	it("reads files in name order", async () => {
		const rows = await run(
			makeIo({
				".notes/b.spec.md": md("---", "---"),
				".notes/a.spec.md": md("---", "---"),
			})
		);
		expect(rows.filter((r) => r.status === "fail").map((r) => r.label)).toEqual([
			".notes/a.spec.md:1",
			".notes/b.spec.md:1",
		]);
	});

	it("checks only the named files that are an ADR or a spec, and drops one that is gone", async () => {
		const rows = await run(
			makeIo({
				"docs/wiki/decisions/0009-task-manifest.md": GOOD_ADR.replace("ADR-0009", "ADR-0010"),
				".notes/tech-x.spec.md": md("---", "status: shipped", "---"),
				"README.md": "no frontmatter",
			}),
			["./.notes/tech-x.spec.md", "README.md", ".notes/moved-away.spec.md"]
		);
		expect(rows.filter((r) => r.status === "fail").map((r) => r.label)).toEqual([".notes/tech-x.spec.md:2"]);
		expect(rows.at(-1)?.detail).toMatch(/^1 file\(s\) checked/);
	});

	it("checks nothing, and says so, when the named files are none of its business", async () => {
		const rows = await run(makeIo({ "README.md": "x" }), ["README.md"]);
		expect(rows.at(-1)).toMatchObject({ status: "ok", detail: "0 file(s) checked, 0 error(s), 0 warning(s)" });
	});
});
