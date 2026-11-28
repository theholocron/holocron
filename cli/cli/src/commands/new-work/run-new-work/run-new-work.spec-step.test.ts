import { describe, expect, it, vi } from "vitest";

const runIdeasPromote = vi.hoisted(() => vi.fn());
const runIssueCreate = vi.hoisted(() => vi.fn());
vi.mock("../../ideas-promote/run-ideas-promote/index.js", () => ({ runIdeasPromote }));
vi.mock("../../issue-create/run-issue-create/index.js", () => ({ runIssueCreate }));

import { loadedWith } from "../../migrate/migrate.testing.js";
import { runNewWork } from "./run-new-work.js";

describe("runNewWork's spec step", () => {
	it("hands the spec step no loader when none was given, so it builds its own", async () => {
		runIssueCreate.mockResolvedValue({ status: "ok", rows: [], key: "#9" });
		runIdeasPromote.mockResolvedValue({ status: "ok", rows: [], path: ".notes/tech-x.spec.md" });
		const report = await runNewWork({
			title: "X",
			loaded: loadedWith(),
			context: { repoRoot: "/r" },
			yes: true,
			spec: true,
			gitConfig: () => "octo",
			io: { exists: () => false, write: () => undefined },
			print: () => undefined,
		});
		expect(runIdeasPromote).toHaveBeenCalledWith(expect.objectContaining({ issue: "#9", yes: true }));
		expect(runIdeasPromote.mock.calls[0]![0]).not.toHaveProperty("loader");
		expect(report).toMatchObject({ status: "ok", key: "#9", specPath: ".notes/tech-x.spec.md" });
	});

	it("reports a failure with no key when the issue step made none", async () => {
		runIssueCreate.mockResolvedValue({ status: "fail", rows: [] });
		const report = await runNewWork({
			title: "X",
			loaded: loadedWith(),
			context: { repoRoot: "/r" },
			yes: true,
			gitConfig: () => "octo",
			print: () => undefined,
		});
		expect(report).toEqual({ status: "fail", rows: [] });
	});
});
