import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { IdeasConfig } from "../../../config/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import type { IdeasIo } from "../ideas-sync.type.js";
import { runIdeasSync } from "./run-ideas-sync.js";
import type { RunIdeasSyncInput } from "./run-ideas-sync.type.js";

const READY = "---\nstatus: in-progress\ntags: [a]\n---\n\n# Add a thing\n\nWe should add a thing.\n";

/** An in-memory vault: path (relative to /vault) to text. Folders come from the paths. */
function memoryIo(files: Record<string, string>, over: Partial<IdeasIo> = {}) {
	const disk = { ...files };
	const writes: string[] = [];
	const io: IdeasIo = {
		readDir: (path) => {
			if (path !== "/vault" && !path.startsWith("/vault/")) return undefined;
			const prefix = path === "/vault" ? "" : path.replace("/vault/", "") + "/";
			const names = new Map<string, boolean>();
			for (const p of Object.keys(disk)) {
				if (!p.startsWith(prefix)) continue;
				const [first, ...rest] = p.slice(prefix.length).split("/");
				names.set(first!, rest.length > 0);
			}
			return [...names].map(([name, directory]) => ({ name, directory }));
		},
		read: (path) => disk[path.replace("/vault/", "")],
		write: (path, text) => {
			writes.push(path);
			disk[path.replace("/vault/", "")] = text;
		},
		home: () => "/home/leia",
		...over,
	};
	return { io, disk, writes };
}

function issuesFake(
	over: Partial<{
		create: (input: unknown) => Promise<{ key: string }>;
		search: () => Promise<Array<{ key: string; body?: string }>>;
	}> = {}
) {
	let n = 100;
	return {
		create: vi.fn(over.create ?? (async () => ({ key: `#${++n}` }))),
		search: vi.fn(over.search ?? (async () => [])),
	};
}

async function run(
	io: IdeasIo,
	options: Partial<RunIdeasSyncInput> & { ideas?: IdeasConfig | null; issues?: ReturnType<typeof issuesFake> } = {}
) {
	const { ideas = { dir: "/vault" }, issues, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith();
	const report = await runIdeasSync({
		loaded: { ...base, resolved: { ...base.resolved, ideas: ideas ?? undefined } },
		context: { repoRoot: "/x" },
		io,
		env: {},
		yes: true,
		loader: fakeLoader(issues ? { issues } : {}),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n") };
}

describe("runIdeasSync", () => {
	it("files a ready note, writes issue: and leaves the rest of the file byte for byte", async () => {
		const { io, disk } = memoryIo({ "idea.md": READY });
		const issues = issuesFake();
		const { report, text } = await run(io, { issues });
		expect(issues.create).toHaveBeenCalledWith({
			summary: "Add a thing",
			body: "# Add a thing\n\nWe should add a thing.\n\nFiled from idea: Add a thing\n<!-- holocron:idea idea.md -->",
		});
		expect(disk["idea.md"]).toBe(READY.replace("tags: [a]\n", "tags: [a]\nissue: #101\n"));
		expect(report.status).toBe("ok");
		expect(text).toContain("idea.md");
		expect(text).toContain("filed as #101");
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("uses the file name as the title when the note has no heading, and a tracker's own key syntax", async () => {
		const { io, disk } = memoryIo({ "sub/no heading.md": "---\nstatus: in-progress\n---\nJust text\n" });
		const issues = issuesFake({ create: async () => ({ key: "ENG-42" }) });
		await run(io, { issues });
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ summary: "no heading" }));
		expect(disk["sub/no heading.md"]).toBe("---\nstatus: in-progress\nissue: ENG-42\n---\nJust text\n");
	});

	it("a second run changes nothing", async () => {
		const { io, writes } = memoryIo({ "idea.md": READY });
		const issues = issuesFake();
		await run(io, { issues });
		const { report, text } = await run(io, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(writes).toHaveLength(1);
		expect(report.status).toBe("ok");
		expect(text).not.toContain("idea.md");
		expect(text).toContain("1 note(s) not ready");
	});

	it("reuses an issue that carries the note's marker: no create, the key is written", async () => {
		const { io, disk } = memoryIo({ "sub/idea.md": READY });
		const issues = issuesFake({
			search: async () => [
				{ key: "#5", body: "other\n<!-- holocron:idea idea.md -->" },
				{ key: "#9", body: "x\n\nFiled from idea: T\n<!-- holocron:idea sub/idea.md -->" },
			],
		});
		const { report, text } = await run(io, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(disk["sub/idea.md"]).toContain("issue: #9");
		expect(text).toContain("already filed as #9");
		expect(report.status).toBe("ok");
	});

	it("creates when the search finds no marker (an issue with no body, or another path)", async () => {
		const { io } = memoryIo({ "idea.md": READY });
		const issues = issuesFake({
			search: async () => [{ key: "#1" }, { key: "#2", body: "<!-- holocron:idea other.md -->" }],
		});
		await run(io, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
	});

	it("fails each row and creates nothing when the search fails", async () => {
		const { io, writes } = memoryIo({ "a.md": READY, "b.md": READY });
		const issues = issuesFake({
			search: async () => {
				throw new Error("502 bad gateway");
			},
		});
		const { report, text } = await run(io, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
		expect(report.status).toBe("fail");
		expect(text).toContain("could not check for an existing issue, so none was created");
		expect(text).toContain("502 bad gateway");
		expect(text).toContain("0 ok, 2 fail, 0 skipped");
	});

	it("honours the configured filing state", async () => {
		const { io } = memoryIo({
			"a.md": "---\nstatus: queued\n---\nA\n",
			"b.md": "---\nstatus: in-progress\n---\nB\n",
		});
		const issues = issuesFake();
		await run(io, { issues, ideas: { dir: "/vault", states: { file: "queued" } } });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ summary: "a" }));
	});

	it("skips notes in other states, with no status, and those in _ and . folders", async () => {
		const { io } = memoryIo({
			"seed.md": "---\nstatus: seed\n---\nx\n",
			"none.md": "no frontmatter\n",
			"_archive/old.md": READY,
			".trash/gone.md": READY,
		});
		const issues = issuesFake();
		const { report, text } = await run(io, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(text).not.toContain("seed.md");
		expect(text).not.toContain("none.md");
		expect(text).toContain("2 note(s) not ready");
		expect(text).not.toContain("old.md");
		expect(text).not.toContain("gone.md");
		expect(report.status).toBe("ok");
	});

	it("reports a note with embedded files and skips it", async () => {
		const { io, disk } = memoryIo({
			"pic.md": "---\nstatus: in-progress\n---\n# Pic\n![[photo.png]]\n",
			"ok.md": READY,
		});
		const issues = issuesFake();
		const { report, text } = await run(io, { issues });
		expect(text).toContain("embedded files");
		expect(text).toContain("![[photo.png]]");
		expect(disk["pic.md"]).not.toContain("issue:");
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
	});

	it("writes nothing and builds no loader on a dry run", async () => {
		const { io, writes } = memoryIo({ "idea.md": READY });
		const load = vi.fn();
		const { report, text } = await run(io, {
			context: { repoRoot: "/x", dryRun: true },
			yes: false,
			interactive: false,
			loader: { load } as never,
		});
		expect(load).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
		expect(text).toContain('would file "Add a thing"');
		expect(text).toContain("(dry-run)");
		expect(report.status).toBe("ok");
	});

	it("lists the notes a dry run would file in path order", async () => {
		const { io } = memoryIo({ "b.md": READY, "a.md": READY });
		const { text } = await run(io, {
			context: { repoRoot: "/x", dryRun: true },
			yes: false,
			interactive: false,
			loader: { load: vi.fn() } as never,
		});
		expect(text.indexOf("a.md")).toBeGreaterThan(-1);
		expect(text.indexOf("a.md")).toBeLessThan(text.indexOf("b.md"));
	});

	it("asks first, and cancels without touching anything on a no", async () => {
		const { io, writes } = memoryIo({ "idea.md": READY });
		const issues = issuesFake();
		const confirm = vi.fn(async () => false);
		const { report } = await run(io, { issues, yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 idea"));
		expect(report.status).toBe("cancelled");
		expect(issues.create).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
	});

	it("files after a yes", async () => {
		const { io, writes } = memoryIo({ "idea.md": READY });
		const issues = issuesFake();
		await run(io, { issues, yes: false, interactive: true, confirm: async () => true });
		expect(writes).toHaveLength(1);
	});

	it("uses an inquirer confirm by default", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const { io, writes } = memoryIo({ "idea.md": READY });
		await run(io, { issues: issuesFake(), yes: false, interactive: true });
		expect(inquirerConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
		expect(writes).toHaveLength(1);
	});

	it("refuses to write without a terminal and without --yes", async () => {
		const { io } = memoryIo({ "idea.md": READY });
		const err = await run(io, { issues: issuesFake(), yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("treats a missing terminal flag as stdin's own state (not a terminal under test)", async () => {
		const { io } = memoryIo({ "idea.md": READY });
		const err = await run(io, { issues: issuesFake(), yes: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("does not ask when nothing is ready", async () => {
		const { io } = memoryIo({ "a.md": "---\nstatus: seed\n---\n" });
		const confirm = vi.fn();
		const { report } = await run(io, { yes: false, interactive: false, confirm });
		expect(confirm).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
	});

	it("turns a provider error into a failing row and goes on with the next note", async () => {
		const { io, disk } = memoryIo({ "a.md": READY, "b.md": READY });
		const create = vi.fn().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce({ key: "#9" });
		const { report, text } = await run(io, { issues: issuesFake({ create }) });
		expect(report.status).toBe("fail");
		expect(text).toContain("could not create the issue");
		expect(text).toContain("rate limited");
		expect(disk["a.md"]).toBe(READY);
		expect(disk["b.md"]).toContain("issue: #9");
		expect(text).toContain("1 ok, 1 fail, 0 skipped");
	});

	it("says so when the issue was made but the note could not be written, and does not create it twice", async () => {
		const { io } = memoryIo(
			{ "a.md": READY },
			{
				write: () => {
					throw new Error("read-only");
				},
			}
		);
		const issues = issuesFake();
		const { report, text } = await run(io, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("fail");
		expect(text).toContain("issue #101 was created but `issue:` was not written");
		expect(text).toContain("add `issue: #101` to the note by hand");
	});

	it("after a failed write, the next run finds the marked issue and does not create another", async () => {
		const { io, disk } = memoryIo({ "a.md": READY });
		const created: string[] = [];
		const issues = issuesFake({
			create: async (input) => {
				created.push((input as { body: string }).body);
				return { key: "#101" };
			},
			search: async () => created.map((body) => ({ key: "#101", body })),
		});
		let fail = true;
		const flaky: IdeasIo = {
			...io,
			write: (p, t) => {
				if (fail) throw new Error("read-only");
				io.write(p, t);
			},
		};
		await run(flaky, { issues });
		fail = false;
		const { report } = await run(flaky, { issues });
		expect(created).toHaveLength(1);
		expect(disk["a.md"]).toContain("issue: #101");
		expect(report.status).toBe("ok");
	});

	it("fails the row when the note vanished before the write", async () => {
		const { io, disk } = memoryIo({ "a.md": READY });
		let reads = 0;
		const flaky: IdeasIo = { ...io, read: (p) => (++reads > 1 ? undefined : disk[p.replace("/vault/", "")]) };
		const { report, text } = await run(flaky, { issues: issuesFake() });
		expect(report.status).toBe("fail");
		expect(text).toContain("can no longer be read");
	});

	it("fails the row for a note that cannot be read", async () => {
		const { io, disk } = memoryIo({ "a.md": READY });
		const unreadable: IdeasIo = { ...io, read: (p) => (p.endsWith("a.md") ? undefined : disk[p]) };
		const { report, text } = await run(unreadable, { issues: issuesFake() });
		expect(report.status).toBe("fail");
		expect(text).toContain("cannot be read");
	});

	it("fails each ready note when the config has no issues provider", async () => {
		const { io, writes } = memoryIo({ "a.md": READY });
		const { report, text } = await run(io);
		expect(report.status).toBe("fail");
		expect(text).toContain("no `issues` provider");
		expect(writes).toEqual([]);
	});

	it("fails with a clear row when no folder is configured, or it cannot be read", async () => {
		const { io } = memoryIo({});
		const none = await run(io, { ideas: null });
		expect(none.report.status).toBe("fail");
		expect(none.text).toContain("set `ideas.dir` in holocron.config or HOLOCRON_IDEAS_DIR");
		const missing = await run({ ...io, readDir: () => undefined }, { ideas: { dir: "/nowhere" } });
		expect(missing.report.status).toBe("fail");
		expect(missing.text).toContain("does not exist or cannot be read");
	});

	it("reads the folder from HOLOCRON_IDEAS_DIR and expands ~", async () => {
		const seen: string[] = [];
		const io: IdeasIo = {
			readDir: (p) => (seen.push(p), []),
			read: () => undefined,
			write: () => undefined,
			home: () => "/home/leia",
		};
		await run(io, { env: { HOLOCRON_IDEAS_DIR: "~/Notes" }, ideas: { dir: "/ignored" } });
		expect(seen).toEqual(["/home/leia/Notes"]);
	});
});
