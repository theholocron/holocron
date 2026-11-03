import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import { findLeftovers } from "./find-leftovers.js";
import { isGenerated } from "./is-generated.js";
import { isScanned } from "./is-scanned.js";
import { LEGACY_TASK_NAMES } from "./legacy-task-names.js";
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
		const text = "delivery.buildX mydelivery.build delivery.build-x delivery.build.yml";
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
		"cli/cli/src/commands/probe/tasks/legacy-task-names.ts",
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

describe("LEGACY_TASK_NAMES", () => {
	it("maps dotted names to flat ids", () => {
		for (const [old, id] of Object.entries(LEGACY_TASK_NAMES)) {
			expect(old).toContain(".");
			expect(id).not.toContain(".");
		}
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

	it("warns (info rows) for each leftover by default", async () => {
		expect(await run(io)).toEqual([
			{ status: "heading", label: "Old task names" },
			{ status: "info", label: "a.yml:2", detail: "delivery.build -> build" },
			{ status: "info", label: "old names", detail: "1 use(s) of 2 old name(s)" },
		]);
	});

	it("fails each leftover with --fail", async () => {
		expect((await run(io, ["--fail"]))[1]!.status).toBe("fail");
	});

	it("is ok when nothing is left", async () => {
		const rows = await run({ files: () => [] });
		expect(rows.at(-1)).toEqual({ status: "ok", label: "old names", detail: "0 use(s) of 2 old name(s)" });
	});
});
