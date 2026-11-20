import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm, select: vi.fn() }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { Issue } from "../../../plugin/index.js";
import type { PromoteIo } from "../../ideas-promote/run-ideas-promote/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runNewWork } from "./run-new-work.js";
import type { RunNewWorkInput } from "./run-new-work.type.js";

const issue: Issue = {
	key: "#9",
	id: "9",
	summary: "Fix the thing",
	body: "It breaks.",
	status: "open",
	statusCategory: "open",
	assignee: null,
	updated: "2026-01-01T00:00:00Z",
};

const fakeIo = (existing: string[] = []) => {
	const files = new Map<string, string>();
	const io: PromoteIo = {
		exists: (path) => existing.includes(path) || files.has(path),
		write: vi.fn((path: string, content: string) => void files.set(path, content)),
	};
	return { io, files };
};

const issuesFake = (create?: () => Promise<{ key: string }>) => ({
	create: vi.fn(create ?? (async () => ({ key: "#9" }))),
	get: vi.fn(async () => issue),
});

async function run(options: Partial<RunNewWorkInput> & { issues?: ReturnType<typeof issuesFake> } = {}) {
	const { issues = issuesFake(), ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith();
	const { io, files } = fakeIo();
	const report = await runNewWork({
		title: "Fix the thing",
		loaded: {
			...base,
			resolved: {
				...base.resolved,
				providers: { issues: { cardinality: "single", tuple: { provider: "github" } } },
			} as never,
		},
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader({ issues }),
		gitConfig: (key) => (key === "github.user" ? "octo" : undefined),
		io,
		interactive: false,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues, files, io };
}

describe("runNewWork", () => {
	it("files the issue with the git config user as the assignee and points at start work", async () => {
		const { report, text, issues, io } = await run({ effort: "low" });
		expect(issues.create).toHaveBeenCalledWith(
			expect.objectContaining({ summary: "Fix the thing", assignees: ["octo"], effort: "low" })
		);
		expect(report).toMatchObject({ status: "ok", key: "#9" });
		expect(text).toContain("next: holocron start work #9");
		expect(io.write).not.toHaveBeenCalled();
	});

	it("lets --assignee override the git config user", async () => {
		const { issues } = await run({ assignees: ["someone"] });
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ assignees: ["someone"] }));
	});

	it("says so when git config holds no login, and assigns nobody", async () => {
		const { issues, text } = await run({ gitConfig: () => undefined });
		expect(issues.create).toHaveBeenCalledWith({ summary: "Fix the thing" });
		expect(text).toContain("git config has no GitHub login");
	});

	it("asks for the Effort on a terminal when none was given", async () => {
		const askEffort = vi.fn(async () => "high" as const);
		const { issues } = await run({ interactive: true, yes: false, askEffort, confirm: async () => true });
		expect(askEffort).toHaveBeenCalledOnce();
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ effort: "high" }));
	});

	it("does not ask for Effort with --yes, on a dry run, off a terminal or when it was given", async () => {
		const askEffort = vi.fn(async () => "high" as const);
		await run({ interactive: true, yes: true, askEffort });
		await run({ interactive: true, yes: false, askEffort, context: { repoRoot: "/r", dryRun: true } });
		await run({ interactive: false, askEffort });
		await run({ interactive: true, yes: false, askEffort, effort: "low", confirm: async () => true });
		expect(askEffort).not.toHaveBeenCalled();
	});

	it("leaves Effort unset when the person skips the question", async () => {
		const { issues } = await run({
			interactive: true,
			yes: false,
			askEffort: async () => undefined,
			confirm: async () => true,
		});
		expect(issues.create).toHaveBeenCalledWith(expect.not.objectContaining({ effort: expect.anything() }));
	});

	it("writes the spec stub from the new issue, in the working tree only", async () => {
		const { report, files, text } = await run({ spec: true });
		expect([...files.keys()]).toEqual(["/r/.notes/tech-fix-the-thing.spec.md"]);
		expect([...files.values()][0]).toContain("issue:");
		expect(report).toMatchObject({ status: "ok", key: "#9", specPath: ".notes/tech-fix-the-thing.spec.md" });
		expect(text).toContain("next: holocron start work #9 --spec .notes/tech-fix-the-thing.spec.md");
	});

	it("takes a spec name", async () => {
		const { files } = await run({ spec: true, specName: "tech-other" });
		expect([...files.keys()]).toEqual(["/r/.notes/tech-other.spec.md"]);
	});

	it("refuses a bad spec name or an existing spec before it files anything", async () => {
		const bad = await run({ spec: true, specName: "Not A Name" });
		expect(bad.report.status).toBe("fail");
		expect(bad.issues.create).not.toHaveBeenCalled();
		expect(bad.text).toContain("is not a spec name");

		const none = await run({ spec: true, title: "!!!" });
		expect(none.text).toContain("pass --spec <name>");
		expect(none.issues.create).not.toHaveBeenCalled();

		const lines: string[] = [];
		const issues = issuesFake();
		const base = loadedWith();
		const report = await runNewWork({
			title: "Fix the thing",
			loaded: base,
			context: { repoRoot: "/r" },
			yes: true,
			spec: true,
			loader: fakeLoader({ issues }),
			io: fakeIo(["/r/.notes/tech-fix-the-thing.spec.md"]).io,
			gitConfig: () => undefined,
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("fail");
		expect(issues.create).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("never overwritten");
	});

	it("keeps the issue as the anchor when the spec cannot be read back", async () => {
		const issues = issuesFake();
		issues.get.mockRejectedValue(new Error("boom"));
		const { report, text } = await run({ issues, spec: true });
		expect(report).toMatchObject({ status: "fail", key: "#9" });
		expect(text).toContain("the issue #9 exists");
	});

	it("previews both on a dry run and writes nothing", async () => {
		const { report, text, issues, io } = await run({ spec: true, context: { repoRoot: "/r", dryRun: true } });
		expect(issues.create).not.toHaveBeenCalled();
		expect(io.write).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "ok", specPath: ".notes/tech-fix-the-thing.spec.md" });
		expect(text).toContain("would file the issue");
		expect(text).toContain("would write .notes/tech-fix-the-thing.spec.md");
	});

	it("stops and writes no spec when the issue fails", async () => {
		const { report, io } = await run({
			spec: true,
			issues: issuesFake(async () => {
				throw new Error("nope");
			}),
		});
		expect(report.status).toBe("fail");
		expect(io.write).not.toHaveBeenCalled();
	});

	it("is cancelled when the person says no, and refuses to ask without a terminal", async () => {
		const cancelled = await run({ yes: false, interactive: true, confirm: async () => false, effort: "low" });
		expect(cancelled.report.status).toBe("cancelled");
		expect(cancelled.issues.create).not.toHaveBeenCalled();
		const err = await run({ yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});
});
