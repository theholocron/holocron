import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { DiscussionPost, Notifications, NotificationsLayout } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { pickDiscussionProvider, runSpecsSync } from "./specs-sync.js";
import type { SpecOrigin, SpecsSyncIo } from "./specs-sync.type.js";

const URL = "https://discord.com/channels/1/2";
const LAYOUT: NotificationsLayout = {
	categories: [{ name: "BUILD", channels: [{ name: "ideas", kind: "forum" }] }],
};
const spec = (title: string, status: string, id: string | null = "SPEC-0001"): string =>
	`---\n${id ? `id: ${id}\n` : ""}status: ${status}\nissue: o/r#1\n---\n\n# ${title}\n\n## Problem\n\nAbout ${title}.\n`;

function loadedFrom(raw: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(raw), filepath: "/tmp/test/holocron.config.json" };
}

function makeIo(files: Record<string, string>, origins: Record<string, SpecOrigin> = {}) {
	const written: Record<string, string> = {};
	const io: SpecsSyncIo = {
		list: (dir) =>
			Object.keys(files)
				.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes("/"))
				.map((f) => f.slice(dir.length + 1)),
		read: (path) => files[path],
		write: (path, text) => {
			written[path] = text;
		},
		origin: (path) => origins[path],
	};
	return { io, written };
}

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		readDiscussion: vi.fn(async (): Promise<DiscussionPost | undefined> => undefined),
		ensureDiscussion: vi.fn(async () => ({
			post: { url: URL, state: "proposed", synced: "proposed" },
			created: true,
		})),
		updateDiscussion: vi.fn(async () => {}),
		...over,
	} as Notifications;
}

function setup(
	notifications: Notifications,
	io: SpecsSyncIo,
	opts: {
		dryRun?: boolean;
		notify?: boolean;
		provider?: string;
		channel?: string;
		repo?: string;
		org?: string;
		files?: string[];
		pr?: number;
		refreshOrigin?: boolean;
		refreshTitles?: boolean;
		withdraw?: boolean;
		/** Leave out `print` and `logger`, as the command does. */
		bare?: boolean;
	} = {}
) {
	const loaded = loadedFrom({
		name: "holocron",
		providers: { notifications: ["discord"] },
	});
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-discord") throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({ name: "discord", capabilities: { notifications: () => notifications } }),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
	const lines: string[] = [];
	return {
		lines,
		run: () =>
			runSpecsSync({
				loaded,
				context: {
					repoRoot: "/tmp/test",
					...(opts.dryRun ? { dryRun: true } : {}),
					...("org" in opts ? (opts.org ? { org: opts.org } : {}) : { org: "theholocron" }),
					...(opts.repo ? { repo: opts.repo } : {}),
				},
				io,
				loader,
				...(opts.notify ? { notify: true } : {}),
				...(opts.files ? { files: opts.files } : {}),
				...(opts.pr ? { pr: opts.pr } : {}),
				...(opts.refreshOrigin ? { refreshOrigin: true } : {}),
				...(opts.refreshTitles ? { refreshTitles: true } : {}),
				...(opts.withdraw ? { withdraw: true } : {}),
				...(opts.provider ? { provider: opts.provider } : {}),
				...(opts.channel ? { channel: opts.channel } : {}),
				...(opts.bare ? {} : { print: (l: string) => lines.push(l), logger: fakeLogger() }),
			}),
	};
}

describe("runSpecsSync", () => {
	it("makes a post for each document, links it, writes the files and reports", async () => {
		const { io, written } = makeIo({
			".notes/a.spec.md": spec("A", "proposed"),
			"docs/wiki/decisions/0001-x.md": `---\nid: ADR-0001\ntitle: X\nstatus: accepted\ndate: 2026-01-01\n---\n\n# X\n\n## Context\n\nCtx.\n`,
		});
		const n = fakeNotifications();
		const { run, lines } = setup(n, io);

		const report = await run();

		expect(report.status).toBe("ok");
		expect(report.files.map((f) => [f.path, f.did])).toEqual([
			[".notes/a.spec.md", ["made the post", "linked the post"]],
			["docs/wiki/decisions/0001-x.md", ["made the post", "set the tag to accepted", "linked the post"]],
		]);
		expect(Object.keys(written)).toEqual([".notes/a.spec.md", "docs/wiki/decisions/0001-x.md"]);
		expect(written[".notes/a.spec.md"]).toContain(`discussion:\n  url: ${URL}`);
		const out = lines.join("\n");
		expect(out).toContain("ADRs and specs → #ideas");
		expect(out).toContain("2 ok, 0 fail, 0 skipped");
	});

	it("says a document already in step is, and writes nothing for it", async () => {
		const text = `---\nid: SPEC-0001\nstatus: proposed\ndiscussion:\n  url: ${URL}\n---\n\n# A\n`;
		const { io, written } = makeIo({ ".notes/a.spec.md": text });
		const n = fakeNotifications({
			ensureDiscussion: vi.fn(async () => ({
				post: { url: URL, state: "proposed", synced: "proposed" },
				created: false,
			})),
		});
		const { run, lines } = setup(n, io);

		const report = await run();

		expect(report.status).toBe("ok");
		expect(written).toEqual({});
		expect(lines.join("\n")).toContain(".notes/a.spec.md: in step");
		expect(lines.join("\n")).toContain("0 ok, 0 fail, 1 skipped");
	});

	it("previews on a dry run: reads, makes and writes nothing", async () => {
		const { io, written } = makeIo({ ".notes/a.spec.md": spec("A", "proposed") });
		const n = fakeNotifications();
		const { run, lines } = setup(n, io, { dryRun: true });

		const report = await run();

		expect(report.status).toBe("dry-run");
		expect(written).toEqual({});
		expect(n.ensureDiscussion).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain(".notes/a.spec.md: would make the post and link it");
		expect(lines.join("\n")).toContain("0 ok, 0 fail, 1 skipped");
	});

	it("carries on past a document that fails, reports it, and fails the run", async () => {
		const { io, written } = makeIo({
			".notes/a.spec.md": spec("A", "proposed"),
			".notes/b.spec.md": spec("B", "proposed"),
		});
		const ensureDiscussion = vi
			.fn()
			.mockRejectedValueOnce(new ProviderApiError("Discord 403: nope", 403, "nope"))
			.mockResolvedValue({ post: { url: URL, state: "proposed", synced: "proposed" }, created: true });
		const { run, lines } = setup(fakeNotifications({ ensureDiscussion }), io);

		const report = await run();

		expect(report.status).toBe("fail");
		expect(report.files[0]?.problem).toBeTruthy();
		expect(Object.keys(written)).toEqual([".notes/b.spec.md"]);
		expect(lines.join("\n")).toContain("1 ok, 1 fail, 0 skipped");
	});

	it("reports a document it cannot sync as a failure without stopping the run", async () => {
		const { io } = makeIo({ ".notes/a.spec.md": "# no front matter\n", ".notes/b.spec.md": spec("B", "proposed") });
		const { run } = setup(fakeNotifications(), io);

		const report = await run();

		expect(report.status).toBe("fail");
		expect(report.files.map((f) => Boolean(f.problem))).toEqual([true, false]);
	});

	it("lets new posts notify people only with --notify", async () => {
		const quiet = fakeNotifications();
		const loud = fakeNotifications();
		await setup(quiet, makeIo({ ".notes/a.spec.md": spec("A", "proposed") }).io).run();
		await setup(loud, makeIo({ ".notes/a.spec.md": spec("A", "proposed") }).io, { notify: true }).run();

		expect(quiet.ensureDiscussion).toHaveBeenCalledWith(expect.objectContaining({ quiet: true }));
		expect(loud.ensureDiscussion).toHaveBeenCalledWith(expect.objectContaining({ quiet: false }));
	});

	it("numbers the specs that have no id, oldest first, after the highest number in use", async () => {
		const files = {
			".notes/old.spec.md": spec("Old", "proposed", "SPEC-0007"),
			".notes/b.spec.md": spec("B", "proposed", null),
			".notes/a.spec.md": spec("A", "proposed", null),
		};
		const { io, written } = makeIo(files, {
			".notes/a.spec.md": { time: 200 },
			".notes/b.spec.md": { time: 100 },
		});

		const report = await setup(fakeNotifications(), io).run();

		expect(report.status).toBe("ok");
		expect(written[".notes/b.spec.md"]).toContain("id: SPEC-0008\n");
		expect(written[".notes/a.spec.md"]).toContain("id: SPEC-0009\n");
		expect(report.files.find((f) => f.path === ".notes/old.spec.md")?.did).not.toContain("numbered it SPEC-0007");
	});

	it("opens each post with the pull request that added the document, from the repo it is run in", async () => {
		const files = { ".notes/a.spec.md": spec("A", "proposed") };
		const origins = { ".notes/a.spec.md": { time: 1, pr: 1538 } };
		const named = fakeNotifications();
		const given = fakeNotifications();
		const unknown = fakeNotifications();
		const noPr = fakeNotifications();
		await setup(named, makeIo(files, origins).io).run();
		await setup(given, makeIo(files, origins).io, { repo: "acme/widgets" }).run();
		await setup(unknown, makeIo(files, origins).io, { org: "" }).run();
		await setup(noPr, makeIo(files, { ".notes/a.spec.md": { time: 1 } }).io).run();

		const body = (n: Notifications) =>
			(n.ensureDiscussion as ReturnType<typeof vi.fn>).mock.calls[0]![0].body as string;
		expect(body(named)).toBe(
			"SPEC-0001\n\nAbout A.\n\nPR: [#1538](<https://github.com/theholocron/holocron/pull/1538>)"
		);
		expect(body(given)).toContain("PR: [#1538](<https://github.com/acme/widgets/pull/1538>)");
		expect(body(unknown)).toBe("SPEC-0001\n\nAbout A.");
		expect(body(noPr)).toBe("SPEC-0001\n\nAbout A.");
	});

	it("syncs only the files asked for, numbering a new spec as the whole tree would", async () => {
		const files = {
			".notes/old.spec.md": spec("Old", "proposed", "SPEC-0007"),
			".notes/new.spec.md": spec("New", "proposed", null),
			".notes/other.spec.md": spec("Other", "proposed", "SPEC-0008"),
		};
		const { io, written } = makeIo(files);
		const n = fakeNotifications();

		const report = await setup(n, io, { files: [".notes/new.spec.md", "README.md"] }).run();

		expect(report.files.map((f) => f.path)).toEqual([".notes/new.spec.md"]);
		expect(n.ensureDiscussion).toHaveBeenCalledTimes(1);
		expect(written[".notes/new.spec.md"]).toContain("id: SPEC-0009\n");
	});

	it("names the pull request it was given instead of the one the file's history names", async () => {
		const files = { ".notes/a.spec.md": spec("A", "proposed") };
		const origins = { ".notes/a.spec.md": { time: 1, pr: 1538 } };
		const given = fakeNotifications();
		const open = fakeNotifications();
		await setup(given, makeIo(files, origins).io, { pr: 1700 }).run();
		await setup(open, makeIo(files).io, { pr: 1700 }).run();

		const body = (n: Notifications) =>
			(n.ensureDiscussion as ReturnType<typeof vi.fn>).mock.calls[0]![0].body as string;
		expect(body(given)).toContain("PR: [#1700](<https://github.com/theholocron/holocron/pull/1700>)");
		expect(body(open)).toContain("PR: [#1700](");
	});

	describe("--refresh-origin", () => {
		const files = { ".notes/a.spec.md": spec("A", "proposed") };
		const origins = { ".notes/a.spec.md": { time: 1, pr: 1538 } };
		const RIGHT = "PR: [#1538](<https://github.com/theholocron/holocron/pull/1538>)";
		const WRONG = "PR: [#9](<https://github.com/theholocron/holocron/pull/9>)";
		const post = (prLine?: string): DiscussionPost => ({
			url: URL,
			state: "proposed",
			synced: "proposed",
			...(prLine ? { prLine } : {}),
		});
		const withPost = (existing: DiscussionPost) =>
			fakeNotifications({
				ensureDiscussion: vi.fn(async () => ({ post: existing, created: false })),
				readDiscussion: vi.fn(async () => existing),
			});

		it("rewrites a post's PR line to the one the current rule names, and counts it", async () => {
			const n = withPost(post(WRONG));
			const { run, lines } = setup(n, makeIo(files, origins).io, { refreshOrigin: true });

			const report = await run();

			expect(n.updateDiscussion).toHaveBeenCalledTimes(1);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", { prLine: RIGHT });
			expect(report.rewritten).toBe(1);
			expect(report.files[0]?.did).toContain("rewrote the PR line to #1538");
			expect(lines.join("\n")).toContain("1 PR line(s) rewritten");
		});

		it("restores a withdrawn post whose file is on the branch, and refreshes its PR line, without writing the file's status", async () => {
			const n = withPost({ ...post(WRONG), state: "withdrawn", closed: true });
			const { io, written } = makeIo(files, origins);

			const report = await setup(n, io, { refreshOrigin: true }).run();

			expect(report.files[0]?.did).toEqual([
				"rewrote the PR line to #1538",
				"set the tag to proposed",
				"reopened the post",
				"linked the post",
			]);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", { prLine: RIGHT });
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", {
				state: "proposed",
				synced: "proposed",
			});
			expect(written[".notes/a.spec.md"]).not.toContain("withdrawn");
		});

		it("adds the line to a post that names no pull request, when the current rule names one", async () => {
			const n = withPost(post());

			await setup(n, makeIo(files, origins).io, { refreshOrigin: true }).run();

			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", { prLine: RIGHT });
		});

		it("takes the line out of a post when the current rule names no pull request", async () => {
			const n = withPost(post(WRONG));

			const report = await setup(n, makeIo(files).io, { refreshOrigin: true }).run();

			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", { prLine: "" });
			expect(report.files[0]?.did).toContain("took the PR line out");
		});

		it("leaves a post whose line is already right, so a second run changes nothing", async () => {
			const n = withPost(post(RIGHT));
			const linkedFiles = {
				".notes/a.spec.md": spec("A", "proposed").replace(
					"issue: o/r#1\n",
					`issue: o/r#1\ndiscussion:\n  url: ${URL}\n`
				),
			};
			const { run, lines } = setup(n, makeIo(linkedFiles, origins).io, { refreshOrigin: true });

			const report = await run();

			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(report.rewritten).toBe(0);
			expect(lines.join("\n")).toContain(".notes/a.spec.md: in step");
			expect(lines.join("\n")).toContain("0 PR line(s) rewritten");
		});

		it("on a dry run says what it would rewrite and edits nothing", async () => {
			const n = withPost(post(WRONG));
			const none = withPost(post(WRONG));
			const { run, lines } = setup(n, makeIo(files, origins).io, { refreshOrigin: true, dryRun: true });

			const report = await run();
			const out = await setup(none, makeIo(files).io, { refreshOrigin: true, dryRun: true }).run();

			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(none.updateDiscussion).not.toHaveBeenCalled();
			expect(report.status).toBe("dry-run");
			expect(report.rewritten).toBe(1);
			expect(report.files[0]?.did).toEqual(["would rewrite the PR line to #1538", "would link the post"]);
			expect(out.files[0]?.did).toContain("would take the PR line out");
			expect(lines.join("\n")).toContain("1 PR line(s) would be rewritten");
		});

		it("leaves a post's first message alone without the flag", async () => {
			const n = withPost(post(WRONG));

			const report = await setup(n, makeIo(files, origins).io).run();

			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(report.rewritten).toBeUndefined();
		});
	});

	describe("--refresh-titles", () => {
		const files = {
			".notes/a.spec.md": spec("A", "proposed", "SPEC-0001"),
			".notes/b.spec.md": spec("B", "proposed", "SPEC-0002"),
			".notes/c.spec.md": spec("C", "proposed", "SPEC-0003"),
		};
		const old = (title: string): DiscussionPost => ({
			url: URL,
			state: "proposed",
			synced: "proposed",
			title,
		});
		const withPosts = (titles: Record<string, string>, updateDiscussion = vi.fn(async () => {})) =>
			fakeNotifications({
				ensureDiscussion: vi.fn(async (input: { key: string }) => ({
					post: old(titles[input.key]!),
					created: false,
				})),
				readDiscussion: vi.fn(async (_c: string, key: string) => old(titles[key]!)),
				updateDiscussion,
			});

		it("renames each post whose title differs, one row each, and counts them", async () => {
			const n = withPosts({
				".notes/a.spec.md": "💡 New spec: A",
				".notes/b.spec.md": "B",
				".notes/c.spec.md": "💡 New spec: C",
			});
			const { run, lines } = setup(n, makeIo(files).io, { refreshTitles: true });

			const report = await run();

			expect(n.updateDiscussion).toHaveBeenCalledTimes(2);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/a.spec.md", { title: "A" });
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/c.spec.md", { title: "C" });
			expect(report.renamed).toBe(2);
			expect(report.files.map((f) => f.titleRenamed ?? false)).toEqual([true, false, true]);
			const out = lines.join("\n");
			expect(out).toContain('.notes/a.spec.md: renamed the post to "A"');
			expect(out).toContain("2 title(s) renamed");
		});

		it("is idempotent: a second run over renamed posts changes nothing", async () => {
			const n = withPosts({ ".notes/a.spec.md": "A", ".notes/b.spec.md": "B", ".notes/c.spec.md": "C" });
			const titled = vi.mocked(n.updateDiscussion!);
			const { run } = setup(n, makeIo(files).io, { refreshTitles: true });

			const report = await run();

			expect(report.renamed).toBe(0);
			expect(titled.mock.calls.filter((c) => "title" in (c[2] as object))).toEqual([]);
		});

		it("on a dry run says what it would rename and renames nothing", async () => {
			const n = withPosts({ ".notes/a.spec.md": "x", ".notes/b.spec.md": "B", ".notes/c.spec.md": "C" });
			const { run, lines } = setup(n, makeIo(files).io, { refreshTitles: true, dryRun: true });

			const report = await run();

			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(report.status).toBe("dry-run");
			expect(report.renamed).toBe(1);
			expect(lines.join("\n")).toContain("1 title(s) would be renamed");
		});

		it("stops cleanly at a rate limit, says how many are left, and does not fail the run", async () => {
			const updateDiscussion = vi
				.fn()
				.mockResolvedValueOnce(undefined)
				.mockRejectedValue(new ProviderApiError("Discord 429", 429, '{"retry_after":540.1}'));
			const n = withPosts(
				{ ".notes/a.spec.md": "x", ".notes/b.spec.md": "x", ".notes/c.spec.md": "x" },
				updateDiscussion
			);
			const { run, lines } = setup(n, makeIo(files).io, { refreshTitles: true });

			const report = await run();

			expect(report.status).toBe("ok");
			expect(report.renamed).toBe(1);
			expect(report.rateLimited).toEqual({ left: 2, retryAfter: 541 });
			expect(updateDiscussion).toHaveBeenCalledTimes(2);
			const out = lines.join("\n");
			expect(out).toContain("it asks for 541 seconds. 2 document(s) are left for the next run");
			expect(out).toContain("1 title(s) renamed");
		});

		it("leaves titles alone without the flag", async () => {
			const n = withPosts({ ".notes/a.spec.md": "x", ".notes/b.spec.md": "x", ".notes/c.spec.md": "x" });

			const report = await setup(n, makeIo(files).io).run();

			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(report.renamed).toBeUndefined();
		});
	});

	it("stops at the first rate limit instead of trying the rest, and does not fail the run", async () => {
		const files = {
			".notes/a.spec.md": spec("A", "proposed", "SPEC-0001"),
			".notes/b.spec.md": spec("B", "proposed", "SPEC-0002"),
			".notes/c.spec.md": spec("C", "proposed", "SPEC-0003"),
			".notes/d.spec.md": spec("D", "proposed", "SPEC-0004"),
		};
		const { io, written } = makeIo(files);
		const ensureDiscussion = vi
			.fn()
			.mockResolvedValueOnce({ post: { url: URL, state: "proposed", synced: "proposed" }, created: true })
			.mockRejectedValue(new ProviderApiError("Discord 429", 429, '{"retry_after":253.2}'));
		const { run, lines } = setup(fakeNotifications({ ensureDiscussion }), io);

		const report = await run();

		expect(report.status).toBe("ok");
		expect(report.rateLimited).toEqual({ left: 3, retryAfter: 254 });
		expect(ensureDiscussion).toHaveBeenCalledTimes(2);
		expect(Object.keys(written)).toEqual([".notes/a.spec.md"]);
		const out = lines.join("\n");
		expect(out).toContain(
			"stopped: the provider is rate limiting; it asks for 254 seconds. 3 document(s) are left for the next run"
		);
		expect(out).toContain("1 ok, 0 fail, 3 skipped");
	});

	it("stops at a rate limit that does not say for how long, without naming a time", async () => {
		const { io } = makeIo({ ".notes/a.spec.md": spec("A", "proposed") });
		const ensureDiscussion = vi.fn().mockRejectedValue(new ProviderApiError("Discord 429", 429, "slow down"));
		const { run, lines } = setup(fakeNotifications({ ensureDiscussion }), io);

		const report = await run();

		expect(report.rateLimited).toEqual({ left: 1, retryAfter: 0 });
		expect(lines.join("\n")).toContain(
			"stopped: the provider is rate limiting. 1 document(s) are left for the next run"
		);
	});

	it("prints to the console, and logs with the shared logger, when none is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { run } = setup(fakeNotifications(), makeIo({ ".notes/a.spec.md": spec("A", "proposed") }).io, {
			bare: true,
		});

		await run();

		expect(log.mock.calls.flat().join("\n")).toContain("ADRs and specs → #ideas");
		log.mockRestore();
	});

	it("names the forum with --channel", async () => {
		const n = fakeNotifications({
			layout: {
				categories: [
					{
						name: "BUILD",
						channels: [
							{ name: "ideas", kind: "forum" },
							{ name: "specs", kind: "forum" },
						],
					},
				],
			},
		});
		const { run } = setup(n, makeIo({ ".notes/a.spec.md": spec("A", "proposed") }).io, { channel: "specs" });

		await run();

		expect(n.ensureDiscussion).toHaveBeenCalledWith(expect.objectContaining({ channel: "specs" }));
	});

	describe("with --withdraw", () => {
		const post = (over: Partial<DiscussionPost> = {}): DiscussionPost => ({
			url: URL,
			state: "proposed",
			synced: "proposed",
			...over,
		});
		const NEW = ".notes/tech-new.spec.md";

		it("withdraws and closes the post of each file this pull request added, sorted, ignoring other paths and repeats", async () => {
			const n = fakeNotifications({ readDiscussion: vi.fn(async () => post()) });
			const { io, written } = makeIo({});
			const { run, lines } = setup(n, io, {
				withdraw: true,
				files: [NEW, "docs/wiki/decisions/0009-b.md", "README.md", NEW],
			});

			const report = await run();

			expect(report.status).toBe("ok");
			expect(report.files.map((f) => [f.path, f.did])).toEqual([
				[NEW, ["withdrew the post"]],
				["docs/wiki/decisions/0009-b.md", ["withdrew the post"]],
			]);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", NEW, { state: "withdrawn", closed: true });
			expect(n.updateDiscussion).toHaveBeenCalledTimes(2);
			expect(n.ensureDiscussion).not.toHaveBeenCalled();
			expect(written).toEqual({});
			expect(lines.join("\n")).toContain("withdrew the post");
		});

		it("keeps the post of a file the base branch already has, and of a file with no post", async () => {
			const readDiscussion = vi.fn(async (_c: string, key: string) => (key === NEW ? undefined : post()));
			const n = fakeNotifications({ readDiscussion });
			const { io } = makeIo({ ".notes/a.spec.md": spec("A", "accepted") });
			const { run } = setup(n, io, { withdraw: true, files: [".notes/a.spec.md", NEW] });

			const report = await run();

			expect(report.files.map((f) => [f.path, f.did])).toEqual([
				[".notes/a.spec.md", ["kept its post: the file is on the base branch"]],
				[NEW, ["has no post to withdraw"]],
			]);
			expect(n.updateDiscussion).not.toHaveBeenCalled();
		});

		it("says it would withdraw on a dry run, and leaves a post that is already withdrawn alone", async () => {
			const posts: Record<string, DiscussionPost> = {
				[NEW]: post(),
				".notes/tech-old.spec.md": post({ state: "withdrawn", closed: true }),
			};
			const n = fakeNotifications({ readDiscussion: vi.fn(async (_c: string, key: string) => posts[key]) });
			const { run, lines } = setup(n, makeIo({}).io, {
				withdraw: true,
				dryRun: true,
				files: [NEW, ".notes/tech-old.spec.md"],
			});

			const report = await run();

			expect(report.status).toBe("dry-run");
			expect(report.files.map((f) => f.did)).toEqual([["would withdraw the post"], []]);
			expect(n.updateDiscussion).not.toHaveBeenCalled();
			expect(lines.join("\n")).toContain("in step");
		});

		it("closes a post that is tagged withdrawn but was reopened", async () => {
			const n = fakeNotifications({ readDiscussion: vi.fn(async () => post({ state: "withdrawn" })) });
			const { run } = setup(n, makeIo({}).io, { withdraw: true, files: [NEW] });

			const report = await run();

			expect(report.files[0]!.did).toEqual(["withdrew the post"]);
		});

		it("is refused with --refresh-titles too", async () => {
			const { run } = setup(fakeNotifications(), makeIo({}).io, {
				withdraw: true,
				refreshTitles: true,
				files: [NEW],
			});
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/cannot be combined/);
		});

		it("is refused with --refresh-origin, which repairs the posts of a synced tree", async () => {
			const { run } = setup(fakeNotifications(), makeIo({}).io, {
				withdraw: true,
				refreshOrigin: true,
				files: [NEW],
			});
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/cannot be combined/);
		});

		it("is refused without --files", async () => {
			const { run } = setup(fakeNotifications(), makeIo({}).io, { withdraw: true });
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/needs `--files`/);
		});
	});

	describe("refuses to start", () => {
		const io = makeIo({}).io;

		it("when no provider can keep discussion posts", async () => {
			const { run } = setup(fakeNotifications({ ensureDiscussion: undefined }), io);
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/keep discussion posts/);
		});

		it("when the provider declares no layout, no forum, or the forum named", async () => {
			expect((await setup(fakeNotifications({ layout: undefined }), io).run()).message).toMatch(
				/declares no layout/
			);
			expect((await setup(fakeNotifications({ layout: {} }), io).run()).message).toMatch(/no forum channel/);
			expect((await setup(fakeNotifications(), io, { channel: "nope" }).run()).message).toMatch(
				/no forum named `nope`/
			);
		});
	});
});

describe("pickDiscussionProvider", () => {
	it("takes the provider that implements all three methods, and names the one asked for", () => {
		const full = fakeNotifications();
		const partial = fakeNotifications({ providerName: "partial", updateDiscussion: undefined });

		expect(pickDiscussionProvider([partial, full])).toBe(full);
		expect(() => pickDiscussionProvider([partial])).toThrow(/keep discussion posts/);
	});
});
