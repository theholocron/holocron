import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import { findLeftovers } from "./find-leftovers.js";
import { isGenerated } from "./is-generated.js";
import { isScanned } from "./is-scanned.js";
import { legacyReplacements } from "./legacy-replacements.js";
import { scriptKeys } from "./script-keys.js";
import type { TasksIo } from "./tasks.type.js";
import { TASKS_PROVIDER, tasksProbes } from "./tasks-probes.js";

const NAMES = { "delivery.build": "build", "verification.unitTests": "test:unit" };

describe("findLeftovers", () => {
	it("reports file, line, old name and replacement, for each use", () => {
		const text = [
			"ok: build",
			'run: "turbo run delivery.build"',
			"a delivery.build and verification.unitTests",
		].join("\n");
		expect(findLeftovers([{ path: "a.yml", text }], NAMES)).toEqual([
			{ file: "a.yml", line: 2, old: "delivery.build", replacement: "build" },
			{ file: "a.yml", line: 3, old: "delivery.build", replacement: "build" },
			{ file: "a.yml", line: 3, old: "verification.unitTests", replacement: "test:unit" },
		]);
	});

	it("matches a whole name only", () => {
		const text = "delivery.buildX mydelivery.build delivery.build-x delivery.build.yml delivery.build";
		expect(findLeftovers([{ path: "a", text }], NAMES).map((f) => f.old)).toEqual(["delivery.build"]);
	});

	it("finds nothing in a clean file", () => {
		expect(findLeftovers([{ path: "a", text: "pnpm build\n" }], NAMES)).toEqual([]);
	});
});

describe("isScanned", () => {
	it.each([
		".github/workflows/ci.yml",
		".husky/pre-push",
		"scripts/x.mjs",
		"package.json",
		"cli/cli/package.json",
		"turbo.json",
		"holocron.config.ts",
		"astromech.config.ts",
		"docs/src/content/docs/a.mdx",
		"README.md",
	])("scans %s", (path) => {
		expect(isScanned(path)).toBe(true);
	});

	it.each([
		"CHANGELOG.md",
		"cli/cli/CHANGELOG.md",
		".notes/a.spec.md",
		"docs/wiki/decisions/a.md",
		"cli/cli/src/a.test.ts",
		"cli/cli/src/commands/probe/tasks/legacy-replacements.ts",
		"cli/cli/src/a.ts",
	])("leaves out %s", (path) => {
		expect(isScanned(path)).toBe(false);
	});
});

describe("isGenerated", () => {
	it("recognises the header in the first lines only", () => {
		expect(isGenerated("# AUTO-GENERATED — do not edit\nname: x")).toBe(true);
		expect(isGenerated("a\nb\nc\nAUTO-GENERATED")).toBe(false);
	});
});

describe("legacyReplacements", () => {
	const replacements = legacyReplacements();

	it("reads astromech's LEGACY_NAMES: dotted names and the bare workflow keys, with the flat ids that replace them", () => {
		expect(replacements["delivery.publish"]).toBe("release");
		expect(replacements["verification.typeSafety"]).toBe("typecheck");
		expect(replacements["platform.repoValidation"]).toBe("validate:specs, validate:docs");
		expect(replacements["review"]).toBe("annotate");
		expect(replacements["stale"]).toBe("mark-stale");
	});

	it("names the read-only prettier half last, in parentheses", () => {
		expect(replacements["sourceQuality.formatting"]).toBe("lint:editorconfig, lint:markdown (format for prettier)");
	});

	it("leaves out a name that is a suite now", () => {
		expect(replacements).not.toHaveProperty("validate");
	});

	it("never maps to a dotted id", () => {
		for (const id of Object.values(replacements)) expect(id).not.toContain(".");
	});
});

describe("scriptKeys", () => {
	it("lists the keys of a field with their lines", () => {
		const text = '{\n  "name": "x",\n  "scripts": {\n    "a": "1",\n    "b": "2"\n  }\n}';
		expect(scriptKeys(text, "scripts")).toEqual([
			{ key: "a", line: 4 },
			{ key: "b", line: 5 },
		]);
	});

	it("is empty for text that is not JSON, a missing field or a field that is not an object", () => {
		expect(scriptKeys("not json", "scripts")).toEqual([]);
		expect(scriptKeys("{}", "scripts")).toEqual([]);
		expect(scriptKeys('{"scripts": "x"}', "scripts")).toEqual([]);
		expect(scriptKeys('{"scripts": null}', "scripts")).toEqual([]);
	});
});

describe("findLeftovers: workflow file names", () => {
	const text = "uses: ./.github/workflows/delivery.build.yml\nfile verification.unitTests.yaml and delivery.build x";

	it("skips a name followed by .yml or .yaml", () => {
		expect(findLeftovers([{ path: "a", text }], NAMES)).toEqual([
			{ file: "a", line: 2, old: "delivery.build", replacement: "build" },
		]);
	});

	it("reports them with options.files", () => {
		expect(findLeftovers([{ path: "a", text }], NAMES, { files: true }).map((f) => f.line)).toEqual([1, 2, 2]);
	});
});

describe("findLeftovers: bare names", () => {
	const bare = { review: "annotate", stale: "mark-stale" };
	const find = (path: string, text: string) => findLeftovers([{ path, text }], bare).map((f) => f.old);

	it("finds one used as a task after a command", () => {
		expect(find("a.md", "holocron run review\npnpm run stale\nturbo run review\npnpm stale")).toEqual([
			"review",
			"stale",
			"review",
			"stale",
		]);
	});

	it("does not find an ordinary word, a longer name or a file name", () => {
		expect(find("a.md", "Please review the stale branch. pnpm review:x pnpm reviewer pnpm review.yml")).toEqual([]);
	});

	it("finds a package.json script and a turbo.json task of that name, once per line", () => {
		const pkg = '{\n  "scripts": {\n    "review": "turbo run review"\n  },\n  "dependencies": {}\n}';
		expect(find("cli/package.json", pkg)).toEqual(["review"]);
		expect(find("turbo.json", '{\n  "tasks": {\n    "stale": {}\n  }\n}')).toEqual(["stale"]);
	});

	it("ignores such keys in other files", () => {
		expect(find("a.json", '{"scripts": {"review": "x"}}')).toEqual([]);
	});

	it("finds nothing to look for in a table with only dotted names", () => {
		expect(findLeftovers([{ path: "a", text: "pnpm review" }], NAMES)).toEqual([]);
	});

	it("finds nothing to look for in a table with only bare names", () => {
		expect(findLeftovers([{ path: "a", text: "delivery.build" }], bare)).toEqual([]);
	});
});

describe("findLeftovers: reserved script names", () => {
	const pkg = (scripts: string) => `{\n  "scripts": {\n${scripts}\n  }\n}`;

	it("reports a script named like an npm lifecycle word, with the task to use for publish", () => {
		const found = findLeftovers(
			[{ path: "pkg/package.json", text: pkg('    "publish": "x",\n    "version": "y",\n    "build": "z"') }],
			NAMES
		);
		expect(found).toEqual([
			{
				file: "pkg/package.json",
				line: 3,
				old: "publish",
				replacement: "release (`publish` is reserved by npm and pnpm)",
			},
			{
				file: "pkg/package.json",
				line: 4,
				old: "version",
				replacement: "(reserved by npm and pnpm, never a task)",
			},
		]);
	});

	it("allows the root prepare, and not another package's", () => {
		const text = pkg('    "prepare": "husky"');
		expect(findLeftovers([{ path: "package.json", text }], NAMES)).toEqual([]);
		expect(findLeftovers([{ path: "a/package.json", text }], NAMES).map((f) => f.old)).toEqual(["prepare"]);
	});

	it("does not look at other files", () => {
		expect(findLeftovers([{ path: "a.md", text: '"publish": "x"' }], NAMES)).toEqual([]);
	});
});

describe("findLeftovers: the allow marker", () => {
	it("skips a line that carries it and the line below it", () => {
		const text = [
			"delivery.build <!-- holocron-allow-old-name -->",
			"delivery.build",
			"delivery.build",
			"<!-- holocron-allow-old-name -->",
			"delivery.build",
			"delivery.build",
		].join("\n");
		expect(findLeftovers([{ path: "a.md", text }], NAMES).map((f) => f.line)).toEqual([3, 6]);
	});
});

async function run(io: TasksIo, args?: string[]): Promise<ProbeRow[]> {
	const rows: ProbeRow[] = [];
	const ctx = { dryRun: false, args, say: (row: ProbeRow) => rows.push(row) } as unknown as ProbeContext;
	await tasksProbes(io, NAMES)["names"]!.run(ctx);
	return rows;
}

describe("tasksProbes", () => {
	const io: TasksIo = { files: () => [{ path: "a.yml", text: "x\nuses delivery.build\n" }] };

	it("is the tasks group with a names probe that writes nothing", () => {
		expect(TASKS_PROVIDER).toBe("tasks");
		expect(tasksProbes(io)["names"]!.writes).toBe(false);
	});

	it("reports each leftover with file, line and replacement", async () => {
		expect(await run(io)).toEqual([
			{ status: "heading", label: "Old task names" },
			{ status: "fail", label: "a.yml:2", detail: "delivery.build -> build" },
			{ status: "fail", label: "old names", detail: "1 use(s) of 2 old name(s)" },
		]);
	});

	it("fails each leftover by default", async () => {
		const rows = await run(io);
		expect(rows[1]!.status).toBe("fail");
		expect(rows.at(-1)!.status).toBe("fail");
	});

	it("only warns (info rows) with --warn", async () => {
		const rows = await run(io, ["--warn"]);
		expect(rows.map((r) => r.status)).toEqual(["heading", "info", "info"]);
	});

	it("lists workflow file names only with --files", async () => {
		const withFile: TasksIo = { files: () => [{ path: "a.yml", text: "uses delivery.build.yml" }] };
		expect((await run(withFile)).at(-1)!.status).toBe("ok");
		expect((await run(withFile, ["--files"])).at(-1)!.status).toBe("fail");
	});

	it("reads astromech's names when none are given", async () => {
		const rows: ProbeRow[] = [];
		const ctx = { dryRun: false, say: (row: ProbeRow) => rows.push(row) } as unknown as ProbeContext;
		await tasksProbes({ files: () => [{ path: "a.md", text: "turbo run delivery.publish" }] })["names"]!.run(ctx);
		expect(rows[1]).toEqual({ status: "fail", label: "a.md:1", detail: "delivery.publish -> release" });
	});

	it("is ok when nothing is left", async () => {
		const rows = await run({ files: () => [] });
		expect(rows.at(-1)).toEqual({ status: "ok", label: "old names", detail: "0 use(s) of 2 old name(s)" });
	});
});
