import { NonInteractiveError } from "@theholocron/kyber/ui";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { pickDeduper, runNotificationsDedupe } from "./notifications-dedupe.js";

function loadedFrom(raw: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(raw), filepath: "/tmp/test/holocron.config.json" };
}

const LAYOUT: NotificationsLayout = {
	categories: [{ name: "Work", channels: [{ name: "prs", kind: "forum", feeds: { prs: true } }, { name: "ideas" }] }],
};

const DUPLICATES = [
	{ key: "o/r#1", extra: 2 },
	{ key: "o/r#7", extra: 1 },
];

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		duplicateDiscussions: vi.fn(async () => DUPLICATES),
		dedupeDiscussion: vi.fn(async (_channel: string, key: string) => (key === "o/r#1" ? 2 : 1)),
		...over,
	} as Notifications;
}

function setup(
	notifications: Notifications,
	opts: {
		dryRun?: boolean;
		yes?: boolean;
		channel?: string;
		provider?: string;
		interactive?: boolean;
		confirm?: (message: string) => Promise<boolean>;
	} = {}
) {
	const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
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
			runNotificationsDedupe({
				loaded,
				context: { repoRoot: "/tmp/test", ...(opts.dryRun ? { dryRun: true } : {}) },
				loader,
				print: (l) => lines.push(l),
				logger: fakeLogger(),
				...(opts.yes ? { yes: true } : {}),
				...(opts.channel ? { channel: opts.channel } : {}),
				...(opts.provider ? { provider: opts.provider } : {}),
				...(opts.interactive !== undefined ? { interactive: opts.interactive } : {}),
				...(opts.confirm ? { confirm: opts.confirm } : {}),
			}),
	};
}

describe("runNotificationsDedupe", () => {
	it("deletes the extra posts of each key in the layout's pull-request forum", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, { yes: true });
		const report = await run();
		expect(n.duplicateDiscussions).toHaveBeenCalledWith("prs");
		expect(n.dedupeDiscussion).toHaveBeenCalledWith("prs", "o/r#1");
		expect(n.dedupeDiscussion).toHaveBeenCalledWith("prs", "o/r#7");
		expect(report).toMatchObject({ status: "ok", channel: "prs", deleted: 3, duplicates: DUPLICATES });
		expect(lines.join("\n")).toContain("o/r#1: 2 extra posts");
		expect(lines.join("\n")).toContain("o/r#7: deleted 1 post");
		expect(lines.at(-1)).toBe("2 ok, 0 fail, 0 skipped");
	});

	it("repairs the forum it is told to, not the pull-request one", async () => {
		const n = fakeNotifications();
		await setup(n, { yes: true, channel: "ideas" }).run();
		expect(n.duplicateDiscussions).toHaveBeenCalledWith("ideas");
	});

	it("lists what it would delete on a dry run and deletes nothing", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, { dryRun: true });
		const report = await run();
		expect(n.dedupeDiscussion).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "dry-run", deleted: 0 });
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 2 skipped (would delete 3 posts from #prs)");
	});

	it("says so, and asks nothing, when no key has more than one post", async () => {
		const n = fakeNotifications({ duplicateDiscussions: vi.fn(async () => []) });
		const confirm = vi.fn(async () => true);
		const { run, lines } = setup(n, { confirm });
		const report = await run();
		expect(report).toMatchObject({ status: "ok", duplicates: [], deleted: 0 });
		expect(confirm).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("#prs: no key has more than one post");
	});

	it("asks first, and deletes when the answer is yes", async () => {
		const n = fakeNotifications();
		const confirm = vi.fn(async () => true);
		const report = await setup(n, { interactive: true, confirm }).run();
		expect(confirm).toHaveBeenCalledWith("Delete 3 posts from #prs, keeping the oldest post of each key?");
		expect(report.status).toBe("ok");
		expect(n.dedupeDiscussion).toHaveBeenCalledTimes(2);
	});

	it("deletes nothing when the answer is no", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, { interactive: true, confirm: async () => false });
		const report = await run();
		expect(report.status).toBe("cancelled");
		expect(n.dedupeDiscussion).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("cancelled; nothing was deleted");
	});

	it("refuses without a terminal unless --yes is given", async () => {
		const n = fakeNotifications();
		await expect(setup(n, { interactive: false }).run()).rejects.toBeInstanceOf(NonInteractiveError);
		expect(n.dedupeDiscussion).not.toHaveBeenCalled();
	});

	it("reports a key it could not repair and goes on with the rest", async () => {
		const n = fakeNotifications({
			dedupeDiscussion: vi.fn(async (_c: string, key: string) => {
				if (key === "o/r#1") throw new Error("403 forbidden");
				return 1;
			}),
		});
		const { run, lines } = setup(n, { yes: true });
		const report = await run();
		expect(report).toMatchObject({
			status: "fail",
			deleted: 1,
			failures: [{ key: "o/r#1", message: "403 forbidden" }],
		});
		expect(lines.at(-1)).toBe("1 ok, 1 fail, 0 skipped");
	});

	it("fails with the reason when the forum cannot be read", async () => {
		const n = fakeNotifications({
			duplicateDiscussions: vi.fn(async () => {
				throw new Error("no forum channel named prs");
			}),
		});
		const report = await setup(n, { yes: true }).run();
		expect(report).toMatchObject({ status: "fail", message: "could not read #prs: no forum channel named prs" });
	});

	it("fails when no forum is named and the layout has no pull-request forum", async () => {
		const n = fakeNotifications({
			layout: { categories: [{ name: "Empty" }, { name: "Work", channels: [{ name: "ideas" }] }] },
		});
		const report = await setup(n, { yes: true }).run();
		expect(report.message).toMatch(/no forum in the layout has `feeds.prs`/);
		expect(n.duplicateDiscussions).not.toHaveBeenCalled();
	});

	it("fails when no forum is named and the layout has more than one pull-request forum", async () => {
		const n = fakeNotifications({
			layout: {
				categories: [
					{
						name: "Work",
						channels: [
							{ name: "prs", kind: "forum", feeds: { prs: true } },
							{ name: "more-prs", kind: "forum", feeds: { prs: true } },
						],
					},
				],
			},
		});
		const report = await setup(n, { yes: true }).run();
		expect(report.message).toMatch(/several forums have `feeds.prs` \(prs, more-prs\)/);
	});

	it("fails when the layout is missing and no forum is named", async () => {
		const n = fakeNotifications({ layout: undefined });
		const report = await setup(n, { yes: true }).run();
		expect(report.status).toBe("fail");
	});

	it("fails when no provider can de-duplicate posts", async () => {
		const n = fakeNotifications({ duplicateDiscussions: undefined });
		const report = await setup(n, { yes: true }).run();
		expect(report.message).toMatch(/no `notifications` provider can de-duplicate forum posts/);
	});
});

describe("pickDeduper", () => {
	const capable = fakeNotifications();
	const other = fakeNotifications({ providerName: "slack" });

	it("takes the only provider that can", () => {
		expect(pickDeduper([fakeNotifications({ dedupeDiscussion: undefined }), capable])).toBe(capable);
	});

	it("needs --provider when several can, and takes the one named", () => {
		expect(() => pickDeduper([capable, other])).toThrow(/pass --provider/);
		expect(pickDeduper([capable, other], "slack")).toBe(other);
	});
});
