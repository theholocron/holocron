import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ select, confirm: vi.fn() }));

import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { fakeProjects } from "../../project/testing/fake-projects.js";
import { runNewWork } from "./run-new-work.js";
import type { RunNewWorkInput } from "./run-new-work.type.js";

const loaded = () => {
	const base = loadedWith();
	return {
		...base,
		resolved: {
			...base.resolved,
			providers: {
				issues: { cardinality: "single", tuple: { provider: "github" } },
				projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }],
			},
		} as never,
	};
};

const base = (over: Partial<RunNewWorkInput> = {}): RunNewWorkInput => ({
	title: "Fix the thing",
	loaded: loaded(),
	context: { repoRoot: mkdtempSync(join(tmpdir(), "new-work-")) },
	print: () => undefined,
	...over,
});

describe("runNewWork with its real defaults", () => {
	it("asks the real prompt for Effort when a terminal is available and no seam is given", async () => {
		select.mockResolvedValueOnce("low");
		const create = vi.fn(async () => ({ key: "#9" }));
		await runNewWork(
			base({
				interactive: true,
				gitConfig: () => undefined,
				confirm: async () => true,
				loader: fakeLoader({ issues: { create } }),
			})
		);
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ effort: "low" }));
	});

	it("reads git config and the disk itself on a dry run, and writes nothing", async () => {
		const create = vi.fn(async () => ({ key: "#9" }));
		const report = await runNewWork(
			base({
				spec: true,
				context: { repoRoot: mkdtempSync(join(tmpdir(), "new-work-")), dryRun: true },
				loader: fakeLoader({ issues: { create } }),
			})
		);
		expect(create).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "ok", specPath: ".notes/tech-fix-the-thing.spec.md" });
	});

	it("keeps the key when the issue was filed but the board step failed", async () => {
		const projects = fakeProjects({ find: vi.fn(async () => undefined), addItems: vi.fn() });
		const report = await runNewWork(
			base({
				yes: true,
				project: "v5",
				gitConfig: () => "octo",
				loader: fakeLoader({ issues: { create: vi.fn(async () => ({ key: "#9" })) }, projects }),
			})
		);
		expect(report).toMatchObject({ status: "fail", key: "#9" });
	});
});
