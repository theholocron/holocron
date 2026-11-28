import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { checkSpecs } from "@theholocron/astromech/repo-validation";
import { NonInteractiveError } from "@theholocron/kyber/ui";
import { format } from "prettier";

import type { Issue } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { realPromoteIo } from "../real-promote-io/index.js";
import { runIdeasPromote } from "./run-ideas-promote.js";
import type { PromoteIo, RunIdeasPromoteInput } from "./run-ideas-promote.type.js";

const issue = (over: Partial<Issue> = {}): Issue => ({
	key: "#7",
	id: "7",
	summary: "feat(ideas): 📝 Add a thing",
	body: "# feat(ideas): 📝 Add a thing\n\nWe should add a thing.\n\n- one\n- two\n\nFiled from idea: Add a thing\n<!-- holocron:idea idea.md -->",
	status: "open",
	statusCategory: "open",
	assignee: null,
	updated: "2026-01-01T00:00:00Z",
	...over,
});

function fakeIo(existing: string[] = []) {
	const files = new Map<string, string>();
	const io: PromoteIo = {
		exists: (path) => existing.includes(path) || files.has(path),
		write: vi.fn((path: string, content: string) => void files.set(path, content)),
	};
	return { io, files };
}

const issuesFake = (get: (key: string) => Promise<Issue>) => ({ get: vi.fn(get) });

async function run(
	options: Partial<RunIdeasPromoteInput> & {
		issues?: ReturnType<typeof issuesFake> | null;
		configured?: boolean;
	} = {}
) {
	const { issues = issuesFake(async () => issue()), configured = true, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith();
	const report = await runIdeasPromote({
		issue: "#7",
		loaded: {
			...base,
			resolved: {
				...base.resolved,
				providers: !configured ? {} : { issues: { cardinality: "single", tuple: { provider: "github" } } },
			} as never,
		},
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader(issues ? { issues } : {}),
		io: fakeIo().io,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues };
}

const SPEC = join("/r", ".notes", "tech-add-a-thing.spec.md");

describe("runIdeasPromote", () => {
	it("writes the spec from the issue, with the marker lines gone, and reads it by the key as typed", async () => {
		const { io, files } = fakeIo();
		const { report, text, issues } = await run({ io });
		expect(issues!.get).toHaveBeenCalledWith("#7");
		expect(report).toMatchObject({ status: "ok", path: join(".notes", "tech-add-a-thing.spec.md") });
		const spec = files.get(SPEC)!;
		expect(spec).toContain("status: draft\nissue: acme/demo#7\nblocked-by: []\n");
		expect(spec).toContain("# feat(ideas): 📝 Add a thing\n\n## Problem\n\nWe should add a thing.");
		expect(spec).not.toContain("Filed from idea");
		expect(spec).not.toContain("holocron:idea");
		expect(spec).not.toMatch(/^id:/m);
		expect(text).toContain("carries the idea marker");
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("takes the issue's address from a GitHub url, and a Linear key as it is", async () => {
		const gh = fakeIo();
		await run({
			io: gh.io,
			issues: issuesFake(async () => issue({ url: "https://github.com/theholocron/holocron/issues/7" })),
		});
		expect(gh.files.get(SPEC)).toContain("issue: theholocron/holocron#7");
		const lin = fakeIo();
		await run({ io: lin.io, issues: issuesFake(async () => issue({ key: "RANDO-7" })) });
		expect(lin.files.get(SPEC)).toContain("issue: RANDO-7");
	});

	it("says when the issue has no idea marker, and still writes", async () => {
		const { io, files } = fakeIo();
		const { report, text } = await run({ io, issues: issuesFake(async () => issue({ body: "Plain text." })) });
		expect(report.status).toBe("ok");
		expect(text).toContain("no `Filed from idea:` marker");
		expect(files.get(SPEC)).toContain("## Problem\n\nPlain text.\n");
	});

	it("uses --name as the whole name", async () => {
		const { io, files } = fakeIo();
		await run({ io, name: "process-add" });
		expect([...files.keys()]).toEqual([join("/r", ".notes", "process-add.spec.md")]);
	});

	it("refuses to overwrite an existing spec", async () => {
		const { io } = fakeIo([SPEC]);
		const { report, text } = await run({ io });
		expect(report.status).toBe("fail");
		expect(io.write).not.toHaveBeenCalled();
		expect(text).toContain("already exists");
		expect(text).toContain("0 ok, 1 fail");
	});

	it("fails on a name it cannot make", async () => {
		const bad = await run({ name: "Not Kebab" });
		expect(bad.report.status).toBe("fail");
		expect(bad.text).toContain('"Not Kebab" is not a spec name');
		const none = await run({ issues: issuesFake(async () => issue({ summary: "📝" })) });
		expect(none.text).toContain("pass --name");
	});

	it("previews on a dry run and writes nothing", async () => {
		const { io } = fakeIo();
		const { report, text } = await run({ io, yes: false, context: { repoRoot: "/r", dryRun: true } });
		expect(io.write).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
		expect(text).toContain("(dry-run)");
		expect(text).toContain(join(".notes", "tech-add-a-thing.spec.md"));
		expect(text).toContain("status: draft");
		expect(text).toContain("would write the spec");
		expect(text).toContain("0 ok, 0 fail, 1 skipped");
	});

	it("reads the real disk when no io is given", async () => {
		const { report } = await run({
			io: undefined,
			context: { repoRoot: "/nonexistent-promote-root", dryRun: true },
		});
		expect(report.status).toBe("ok");
	});

	it("refuses to write without a terminal and without --yes", async () => {
		const { io } = fakeIo();
		const err = await run({ io, yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(io.write).not.toHaveBeenCalled();
	});

	it("asks first, and a no writes nothing", async () => {
		const { io } = fakeIo();
		const confirm = vi.fn(async () => false);
		const { report, text } = await run({ io, yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith(`Write ${join(".notes", "tech-add-a-thing.spec.md")} from #7?`);
		expect(report.status).toBe("cancelled");
		expect(text).toContain("cancelled; nothing was written");
		expect(io.write).not.toHaveBeenCalled();
		const yes = await run({ io, yes: false, interactive: true, confirm: async () => true });
		expect(yes.report.status).toBe("ok");
	});

	it("uses the inquirer prompt, and the terminal check, by default", async () => {
		const { io } = fakeIo();
		inquirerConfirm.mockResolvedValueOnce(true);
		const before = process.stdin.isTTY;
		process.stdin.isTTY = true;
		const { report } = await run({ io, yes: false }).finally(() => void (process.stdin.isTTY = before));
		expect(inquirerConfirm).toHaveBeenCalled();
		expect(report.status).toBe("ok");
	});

	it("fails when the config has no issues provider, or it does not load", async () => {
		const none = await run({ configured: false });
		expect(none.report.status).toBe("fail");
		expect(none.text).toContain("no `issues` provider");
		const missing = await run({
			issues: null,
			loader: fakeLoader({}, { issues: "boom" }),
		});
		expect(missing.text).toContain("not available (boom)");
		const silent = await run({ issues: null });
		expect(silent.text).toContain("not available");
		expect(silent.text).not.toContain("(");
	});

	it("fails with the reason when the issue cannot be read", async () => {
		const { report, text } = await run({
			issues: issuesFake(async () => {
				throw new Error("404");
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not read the issue");
	});

	it("fails with the reason when the write does", async () => {
		const { io } = fakeIo();
		vi.mocked(io.write).mockImplementation(() => {
			throw new Error("EACCES");
		});
		const { report, text } = await run({ io });
		expect(report.status).toBe("fail");
		expect(text).toContain("could not write the spec");
	});
});

describe("a spec written to disk", () => {
	let dir = "";
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("passes specs check with no finding but the missing id, and Prettier leaves it as it is", async () => {
		dir = mkdtempSync(join(tmpdir(), "promote-"));
		const { report } = await run({ context: { repoRoot: dir }, io: realPromoteIo });
		expect(report.status).toBe("ok");
		const path = join(dir, report.path!);
		const text = readFileSync(path, "utf8");
		expect(await format(text, { parser: "markdown" })).toBe(text);
		const { findings } = checkSpecs([{ path: report.path!, text }]);
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
		expect(findings.map((f) => f.rule)).toEqual(["id"]);
		// A second run does not overwrite it.
		const again = await run({ context: { repoRoot: dir }, io: realPromoteIo });
		expect(again.report.status).toBe("fail");
		expect(readFileSync(path, "utf8")).toBe(text);
	});
});
