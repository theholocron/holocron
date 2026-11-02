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
