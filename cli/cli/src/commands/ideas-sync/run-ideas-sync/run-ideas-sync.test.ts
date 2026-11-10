import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { IdeasConfig } from "../../../config/index.js";
import type { IdeaRecord, Ideas } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runIdeasSync } from "./run-ideas-sync.js";
import type { RunIdeasSyncInput } from "./run-ideas-sync.type.js";

const idea = (key: string, over: Partial<IdeaRecord> = {}): IdeaRecord => ({
	key,
	title: "Add a thing",
	body: "\n# Add a thing\n\nWe should add a thing.\n",
	status: "in-progress",
	attachments: [],
	...over,
});

/** An `ideas` provider over an in-memory list; `markFiled` records the issue on the idea, as a real one would. */
function ideasFake(records: IdeaRecord[], over: Partial<Ideas> = {}) {
	const store = records.map((r) => ({ ...r }));
	const markFiled = vi.fn(async (key: string, issue: string) => {
		const found = store.find((r) => r.key === key);
		if (!found) throw new Error("the note can no longer be read");
		found.issue = issue;
	});
	const fake = {
		key: "ideas",
		providerName: "fake",
		list: vi.fn(async () => store.map((r) => ({ ...r }))),
		setStatus: vi.fn(async () => undefined),
		markFiled,
		...over,
	} as unknown as Ideas;
	return { ideas: fake, store, markFiled };
}

function issuesFake(
	over: Partial<{
		create: (input: unknown) => Promise<{ key: string }>;
		search: (filter: { text?: string; limit?: number }) => Promise<Array<{ key: string; body?: string }>>;
	}> = {}
) {
	let n = 100;
	return {
		create: vi.fn(over.create ?? (async () => ({ key: `#${++n}` }))),
		search: vi.fn(over.search ?? (async () => [])),
	};
}

async function run(
	ideas: Ideas | undefined,
	options: Partial<RunIdeasSyncInput> & { config?: IdeasConfig | null; issues?: ReturnType<typeof issuesFake> } = {}
) {
	const { config = { states: {} }, issues, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith();
	const report = await runIdeasSync({
		loaded: {
			...base,
			resolved: {
				...base.resolved,
				ideas: config ?? undefined,
				providers: { ...base.resolved.providers, ...(ideas ? { ideas: obsidianEntry({}) } : {}) },
			},
		},
		context: { repoRoot: "/x" },
		env: {},
		yes: true,
		ideasLoader: fakeLoader(ideas ? { ideas } : {}),
		loader: fakeLoader(issues ? { issues } : {}),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n") };
}

function obsidianEntry(options: Record<string, unknown>) {
	return {
		cardinality: "single" as const,
		tuple: { provider: "obsidian", packageName: "@theholocron/holocron-plugin-obsidian", options },
	};
}

describe("runIdeasSync", () => {
	it("files a ready idea through issues and records the issue with markFiled", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const issues = issuesFake();
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledWith({
			summary: "Add a thing",
			body: "# Add a thing\n\nWe should add a thing.\n\nFiled from idea: Add a thing\n<!-- holocron:idea idea.md -->",
		});
		expect(markFiled).toHaveBeenCalledWith("idea.md", "#101");
		expect(report.status).toBe("ok");
		expect(text).toContain("idea.md");
		expect(text).toContain("filed as #101");
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("uses a tracker's own key syntax", async () => {
		const { ideas, markFiled } = ideasFake([idea("sub/no heading.md", { title: "no heading" })]);
		const issues = issuesFake({ create: async () => ({ key: "ENG-42" }) });
		await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ summary: "no heading" }));
		expect(markFiled).toHaveBeenCalledWith("sub/no heading.md", "ENG-42");
	});

	it("a second run changes nothing", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const issues = issuesFake();
		await run(ideas, { issues });
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(markFiled).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
		expect(text).not.toContain("idea.md");
		expect(text).toContain("1 note(s) not ready");
	});

	it("reuses an issue that carries the idea's marker: no create, the key is recorded", async () => {
		const { ideas, markFiled } = ideasFake([idea("sub/idea.md")]);
		const issues = issuesFake({
			search: async () => [
				{ key: "#5", body: "other\n<!-- holocron:idea idea.md -->" },
				{ key: "#9", body: "x\n\nFiled from idea: T\n<!-- holocron:idea sub/idea.md -->" },
			],
		});
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(markFiled).toHaveBeenCalledWith("sub/idea.md", "#9");
		expect(text).toContain("already filed as #9");
		expect(report.status).toBe("ok");
	});

	it("creates when the search finds no marker (an issue with no body, or another key)", async () => {
		const { ideas } = ideasFake([idea("idea.md")]);
		const issues = issuesFake({
			search: async () => [{ key: "#1" }, { key: "#2", body: "<!-- holocron:idea other.md -->" }],
		});
		await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
	});

	it("fails the row of a note whose search throws, creates nothing for it, and goes on with the others", async () => {
		const { ideas, markFiled } = ideasFake([idea("a.md"), idea("b.md")]);
		const issues = issuesFake({
			search: async ({ text }) => {
				if (text?.includes("a.md")) throw new Error("502 bad gateway");
				return [];
			},
		});
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("b.md") }));
		expect(markFiled).toHaveBeenCalledTimes(1);
		expect(markFiled).toHaveBeenCalledWith("b.md", "#101");
		expect(report.status).toBe("fail");
		expect(text).toContain("could not check for an existing issue, so none was created");
		expect(text).toContain("502 bad gateway");
		expect(text).toContain("1 ok, 1 fail, 0 skipped");
	});

	it("searches by the exact marker text, once per candidate note", async () => {
		const { ideas } = ideasFake([idea("a.md"), idea("b.md")]);
		const issues = issuesFake();
		await run(ideas, { issues });
		expect(issues.search).toHaveBeenCalledTimes(4); // before and after the create, for each note
		expect(issues.search).toHaveBeenCalledWith(expect.objectContaining({ text: "<!-- holocron:idea a.md -->" }));
		expect(issues.search).toHaveBeenCalledWith(expect.objectContaining({ text: "<!-- holocron:idea b.md -->" }));
	});

	it("searches only for candidate notes", async () => {
		const { ideas } = ideasFake([
			idea("ready.md"),
			idea("other.md", { status: "draft" }),
			idea("filed.md", { issue: "#7" }),
			idea("files.md", { attachments: ["pic.png"] }),
			idea("broken.md", { error: "unreadable" }),
		]);
		const issues = issuesFake();
		await run(ideas, { issues });
		expect(issues.search).toHaveBeenCalledTimes(2); // before the create and once after it, for the one note
		expect(issues.search).toHaveBeenCalledWith(
			expect.objectContaining({ text: "<!-- holocron:idea ready.md -->" })
		);
	});

	it("ignores an issue the text search returns whose body lacks the exact marker", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const issues = issuesFake({
			search: async () => [{ key: "#4", body: "mentions holocron:idea idea.md but not the marker" }],
		});
		const { text } = await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(markFiled).toHaveBeenCalledWith("idea.md", "#101");
		expect(text).not.toContain("already filed");
	});

	it("finds an issue older than 100 others, because the search is by text, not by recency", async () => {
		const tracker = [
			{ key: "#1", body: "old\n\n<!-- holocron:idea idea.md -->" },
			...Array.from({ length: 150 }, (_, i) => ({ key: `#${i + 2}`, body: "newer" })),
		].reverse();
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const issues = issuesFake({
			search: async ({ text, limit }) =>
				tracker.filter((i) => (text ? i.body.includes(text) : true)).slice(0, limit),
		});
		const { text } = await run(ideas, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(markFiled).toHaveBeenCalledWith("idea.md", "#1");
		expect(text).toContain("already filed as #1");
	});

	it("honours the configured filing state", async () => {
		const { ideas } = ideasFake([
			idea("a.md", { status: "queued", title: "a" }),
			idea("b.md", { status: "in-progress", title: "b" }),
		]);
		const issues = issuesFake();
		await run(ideas, { issues, config: { states: { file: "queued" } } });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({ summary: "a" }));
	});

	it("skips ideas in other states or with no status, and counts them", async () => {
		const { ideas } = ideasFake([idea("seed.md", { status: "seed" }), idea("none.md", { status: "" })]);
		const issues = issuesFake();
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).not.toHaveBeenCalled();
		expect(text).not.toContain("seed.md");
		expect(text).toContain("2 note(s) not ready");
		expect(report.status).toBe("ok");
	});

	it("reports an idea with attachments and skips it", async () => {
		const { ideas, markFiled } = ideasFake([idea("pic.md", { attachments: ["![[photo.png]]"] }), idea("ok.md")]);
		const issues = issuesFake();
		const { report, text } = await run(ideas, { issues });
		expect(text).toContain("embedded files");
		expect(text).toContain("![[photo.png]]");
		expect(markFiled).toHaveBeenCalledTimes(1);
		expect(markFiled).toHaveBeenCalledWith("ok.md", "#101");
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
	});

	it("writes nothing and builds no issues loader on a dry run", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const load = vi.fn();
		const { report, text } = await run(ideas, {
			context: { repoRoot: "/x", dryRun: true },
			yes: false,
			interactive: false,
			loader: { load } as never,
		});
		expect(load).not.toHaveBeenCalled();
		expect(markFiled).not.toHaveBeenCalled();
		expect(text).toContain('would file "Add a thing"');
		expect(text).toContain("(dry-run)");
		expect(report.status).toBe("ok");
	});

	it("lists the ideas a dry run would file in key order", async () => {
		const { ideas } = ideasFake([idea("b.md"), idea("a.md")]);
		const { text } = await run(ideas, {
			context: { repoRoot: "/x", dryRun: true },
			yes: false,
			interactive: false,
			loader: { load: vi.fn() } as never,
		});
		expect(text.indexOf("a.md")).toBeGreaterThan(-1);
		expect(text.indexOf("a.md")).toBeLessThan(text.indexOf("b.md"));
	});

	it("asks first, and cancels without touching anything on a no", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		const issues = issuesFake();
		const confirm = vi.fn(async () => false);
		const { report } = await run(ideas, { issues, yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 idea"));
		expect(report.status).toBe("cancelled");
		expect(issues.create).not.toHaveBeenCalled();
		expect(markFiled).not.toHaveBeenCalled();
	});

	it("files after a yes", async () => {
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		await run(ideas, { issues: issuesFake(), yes: false, interactive: true, confirm: async () => true });
		expect(markFiled).toHaveBeenCalledTimes(1);
	});

	it("uses an inquirer confirm by default", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const { ideas, markFiled } = ideasFake([idea("idea.md")]);
		await run(ideas, { issues: issuesFake(), yes: false, interactive: true });
		expect(inquirerConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
		expect(markFiled).toHaveBeenCalledTimes(1);
	});

	it("refuses to write without a terminal and without --yes", async () => {
		const { ideas } = ideasFake([idea("idea.md")]);
		const err = await run(ideas, { issues: issuesFake(), yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("treats a missing terminal flag as stdin's own state (not a terminal under test)", async () => {
		const { ideas } = ideasFake([idea("idea.md")]);
		const err = await run(ideas, { issues: issuesFake(), yes: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("does not ask when nothing is ready", async () => {
		const { ideas } = ideasFake([idea("a.md", { status: "seed" })]);
		const confirm = vi.fn();
		const { report } = await run(ideas, { yes: false, interactive: false, confirm });
		expect(confirm).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
	});

	it("turns a provider error into a failing row and goes on with the next idea", async () => {
		const { ideas, markFiled } = ideasFake([idea("a.md"), idea("b.md")]);
		const create = vi.fn().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce({ key: "#9" });
		const { report, text } = await run(ideas, { issues: issuesFake({ create }) });
		expect(report.status).toBe("fail");
		expect(text).toContain("could not create the issue");
		expect(text).toContain("rate limited");
		expect(markFiled).toHaveBeenCalledTimes(1);
		expect(markFiled).toHaveBeenCalledWith("b.md", "#9");
		expect(text).toContain("1 ok, 1 fail, 0 skipped");
	});

	it("says so when the issue was made but could not be recorded, and does not create it twice", async () => {
		const { ideas } = ideasFake([idea("a.md")], {
			markFiled: async () => {
				throw new Error("read-only");
			},
		});
		const issues = issuesFake();
		const { report, text } = await run(ideas, { issues });
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("fail");
		expect(text).toContain("issue #101 was created but `issue:` was not written");
		expect(text).toContain("add `issue: #101` to the note by hand");
	});

	it("after a failed record, the next run finds the marked issue and does not create another", async () => {
		const created: string[] = [];
		const issues = issuesFake({
			create: async (input) => {
				created.push((input as { body: string }).body);
				return { key: "#101" };
			},
			search: async () => created.map((body) => ({ key: "#101", body })),
		});
		let fail = true;
		const { ideas, store } = ideasFake([idea("a.md")]);
		const flaky = {
			...ideas,
			list: ideas.list.bind(ideas),
			markFiled: async (key: string, issue: string) => {
				if (fail) throw new Error("read-only");
				await ideas.markFiled(key, issue);
			},
		} as unknown as Ideas;
		await run(flaky, { issues });
		fail = false;
		const { report } = await run(flaky, { issues });
		expect(created).toHaveLength(1);
		expect(store[0]!.issue).toBe("#101");
		expect(report.status).toBe("ok");
	});

	it("fails the row when the idea vanished before it could be recorded", async () => {
		const { ideas, store } = ideasFake([idea("a.md")]);
		const issues = issuesFake({
			create: async () => {
				store.length = 0;
				return { key: "#1" };
			},
		});
		const { report, text } = await run(ideas, { issues });
		expect(report.status).toBe("fail");
		expect(text).toContain("can no longer be read");
	});

	it("fails the row for an idea the provider could not read", async () => {
		const { ideas } = ideasFake([idea("a.md", { error: "cannot be read", status: "" })]);
		const { report, text } = await run(ideas, { issues: issuesFake() });
		expect(report.status).toBe("fail");
		expect(text).toContain("a.md");
		expect(text).toContain("cannot be read");
	});

	it("fails each ready idea when the config has no issues provider", async () => {
		const { ideas, markFiled } = ideasFake([idea("a.md")]);
		const { report, text } = await run(ideas);
		expect(report.status).toBe("fail");
		expect(text).toContain("no `issues` provider");
		expect(markFiled).not.toHaveBeenCalled();
	});

	it("fails with a clear row when the config names no place for ideas", async () => {
		const { report, text } = await run(undefined, { config: null });
		expect(report.status).toBe("fail");
		expect(text).toContain("no `ideas` provider");
		expect(text).toContain("HOLOCRON_IDEAS_DIR");
	});

	it("fails with the plugin's reason when the ideas provider did not load", async () => {
		const base = loadedWith();
		const lines: string[] = [];
		const report = await runIdeasSync({
			loaded: { ...base, resolved: { ...base.resolved, providers: { ideas: obsidianEntry({}) } } },
			context: { repoRoot: "/x" },
			env: {},
			yes: true,
			ideasLoader: fakeLoader({}, { ideas: "boom" }),
			print: (l) => lines.push(stripVTControlCharacters(l)),
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain("`ideas` provider is not available (boom)");
	});

	it("says the provider is not available when it left no reason", async () => {
		const base = loadedWith();
		const lines: string[] = [];
		await runIdeasSync({
			loaded: { ...base, resolved: { ...base.resolved, providers: { ideas: obsidianEntry({}) } } },
			context: { repoRoot: "/x" },
			env: {},
			ideasLoader: fakeLoader({}),
			print: (l) => lines.push(stripVTControlCharacters(l)),
		});
		expect(lines.join("\n")).toContain("`ideas` provider is not available");
		expect(lines.join("\n")).not.toContain("(");
	});

	it("fails with a clear row when the provider cannot list", async () => {
		const { ideas } = ideasFake([], {
			list: async () => {
				throw new Error("the notes folder does not exist or cannot be read: /nowhere");
			},
		});
		const { report, text } = await run(ideas);
		expect(report.status).toBe("fail");
		expect(text).toContain("does not exist or cannot be read: /nowhere");
	});
	it("does not search again for a note that was already filed by its marker", async () => {
		const { ideas } = ideasFake([idea("idea.md")]);
		const issues = issuesFake({ search: async () => [{ key: "#9", body: "x\n<!-- holocron:idea idea.md -->" }] });
		await run(ideas, { issues });
		expect(issues.search).toHaveBeenCalledTimes(1);
	});

	describe("two overlapping runs for one note", () => {
		/** Resolves every caller once `parties` have arrived, so a test decides which step of each run goes first. */
		function barrier(parties: number) {
			let waiting: Array<() => void> = [];
			return async () => {
				await new Promise<void>((resolve) => {
					waiting.push(resolve);
					if (waiting.length === parties) {
						const release = waiting;
						waiting = [];
						for (const r of release) r();
					}
				});
			};
		}

		/** One tracker shared by both runs; each run gets its own handle with the barriers that interleave it. */
		function sharedTracker(options: { failSearchAfterCreate?: boolean; failClose?: boolean } = {}) {
			const issues: Array<{ key: string; body: string; open: boolean; comments: string[] }> = [];
			const afterSearch = barrier(2);
			const afterCreate = barrier(2);
			const handle = () => {
				let searches = 0;
				return {
					search: vi.fn(async ({ text }: { text?: string }) => {
						searches++;
						if (searches === 2 && options.failSearchAfterCreate) throw new Error("rate limited");
						const hits = issues
							.filter((i) => text !== undefined && i.body.includes(text))
							.map((i) => ({ ...i }));
						// Both runs look before either creates, as in the race.
						if (searches === 1) await afterSearch();
						return hits;
					}),
					create: vi.fn(async (input: { body?: string }) => {
						const key = `#${100 + issues.length + 1}`;
						issues.push({ key, body: input.body ?? "", open: true, comments: [] });
						// Both runs create before either looks again.
						await afterCreate();
						return { key };
					}),
					comment: vi.fn(async (key: string, body: string) => {
						issues.find((i) => i.key === key)?.comments.push(body);
					}),
					transition: vi.fn(async (key: string) => {
						if (options.failClose) throw new Error("403 forbidden");
						const found = issues.find((i) => i.key === key);
						if (found) found.open = false;
						return { transitioned: true, status: "closed", via: "closed" };
					}),
				};
			};
			return { issues, handle };
		}

		async function race(options: Parameters<typeof sharedTracker>[0] = {}) {
			const tracker = sharedTracker(options);
			// One note store both runs read and write, like a vault both Macs see.
			const { ideas, store, markFiled } = ideasFake([idea("idea.md")]);
			const a = tracker.handle();
			const b = tracker.handle();
			const [ra, rb] = await Promise.all([
				run(ideas, { issues: a as unknown as ReturnType<typeof issuesFake> }),
				run(ideas, { issues: b as unknown as ReturnType<typeof issuesFake> }),
			]);
			return { tracker, store, markFiled, a, b, ra, rb };
		}

		it("leaves exactly one open issue, the same key in the note from both runs, and the loser closed with a comment", async () => {
			const { tracker, store, markFiled, a, b, ra, rb } = await race();
			expect(tracker.issues.filter((i) => i.open).map((i) => i.key)).toEqual(["#101"]);
			expect(markFiled.mock.calls).toEqual([
				["idea.md", "#101"],
				["idea.md", "#101"],
			]);
			expect(store[0]?.issue).toBe("#101");
			const loser = tracker.issues.find((i) => i.key === "#102");
			expect(loser?.open).toBe(false);
			expect(loser?.comments).toEqual(["Duplicate of #101: the same idea was filed by two overlapping runs."]);
			expect(tracker.issues[0]?.comments).toEqual([]);
			// The winner's run changed nothing; the loser's run commented and closed its own issue only.
			expect(a.comment).not.toHaveBeenCalled();
			expect(a.transition).not.toHaveBeenCalled();
			expect(b.comment).toHaveBeenCalledTimes(1);
			expect(b.transition).toHaveBeenCalledWith("#102", "done");
			expect(ra.text).toContain("filed as #101");
			expect(ra.text).not.toContain("closed duplicate");
			expect(rb.text).toContain("filed as #101 (closed duplicate #102 from an overlapping run)");
			expect(ra.report.status).toBe("ok");
			expect(rb.report.status).toBe("ok");
			expect(rb.text).toContain("1 ok, 0 fail, 0 skipped");
		});

		it("keeps its own key and warns, naming both keys, when the second search throws", async () => {
			const { tracker, markFiled, ra, rb } = await race({ failSearchAfterCreate: true });
			// Neither run could look, so both keep their own issue; the note says so and the owner is told.
			expect(markFiled.mock.calls.map((c) => c[1]).sort()).toEqual(["#101", "#102"]);
			expect(tracker.issues.every((i) => i.open)).toBe(true);
			expect(ra.report.status).toBe("ok");
			expect(ra.text).toContain(
				"filed as #101; could not check for a duplicate from an overlapping run (rate limited)"
			);
			expect(rb.text).toContain("filed as #102; could not check for a duplicate");
			expect(ra.text).toContain("close the extra one by hand");
		});

		it("keeps its own key and warns, naming both keys, when the duplicate cannot be closed", async () => {
			const { markFiled, rb } = await race({ failClose: true });
			expect(markFiled.mock.calls.map((c) => c[1]).sort()).toEqual(["#101", "#102"]);
			expect(rb.report.status).toBe("ok");
			expect(rb.text).toContain("filed as #102, but #101 is an older issue for the same idea");
			expect(rb.text).toContain("could not be closed (403 forbidden)");
			expect(rb.text).toContain("close the extra one by hand");
		});
	});
});
