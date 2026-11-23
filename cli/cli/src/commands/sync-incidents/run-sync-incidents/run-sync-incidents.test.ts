import { describe, expect, it, vi } from "vitest";

import type { LoadedConfig } from "../../../config/index.js";
import type {
	DiscussionPost,
	Monitoring,
	MonitoringIncident,
	Notifications,
	NotificationsLayout,
	PluginLoader,
} from "../../../plugin/index.js";
import { ProviderApiError } from "../../../plugin/index.js";
import { renderIncident, renderIncidentUpdate } from "../../render-incident/index.js";
import { runSyncIncidents } from "./run-sync-incidents.js";

const LAYOUT: NotificationsLayout = {
	categories: [
		{ name: "OPS", channels: [{ name: "incidents", kind: "forum", feeds: { incidents: "The Holocron" } }] },
	],
};
const PAGE = { name: "The Holocron", domain: "status.example.com" };

const incident = (over: Partial<MonitoringIncident> = {}): MonitoringIncident => ({
	id: "i1",
	title: "Sentinel is down",
	status: "investigating",
	impacts: [{ component: "Sentinel", impact: "major" }],
	startedAt: "2026-11-20T10:00:00Z",
	updates: [{ id: "u1", status: "investigating", text: "looking", at: "2026-11-20T10:00:00Z" }],
	...over,
});
const statusPage = { name: PAGE.name, url: `https://${PAGE.domain}` };

function fakes(
	opts: {
		incidents?: MonitoringIncident[];
		list?: () => Promise<MonitoringIncident[]>;
		layout?: NotificationsLayout;
		pages?: unknown[];
		post?: DiscussionPost;
		messages?: string[];
		notifications?: Partial<Notifications>;
		noMonitoring?: boolean;
	} = {}
) {
	const notifications = {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: opts.layout ?? LAYOUT,
		readDiscussion: vi.fn(async () => opts.post),
		readDiscussionMessages: vi.fn(async () => opts.messages ?? []),
		ensureDiscussion: vi.fn(async () => ({ post: { url: "u" }, created: true })),
		updateDiscussion: vi.fn(async () => {}),
		postDiscussionMessage: vi.fn(async () => {}),
		dedupeDiscussion: vi.fn(async () => 0),
		...opts.notifications,
	} as unknown as Notifications;
	const monitoring = {
		key: "monitoring",
		statusPages: opts.pages ?? [PAGE],
		listIncidents: vi.fn(opts.list ?? (async () => opts.incidents ?? [incident()])),
	} as unknown as Monitoring;
	const loader = {
		load: async () => {},
		loadFailures: () => [],
		loadedKeys: () => ["notifications", "monitoring"],
		has: (key: string) => (key === "monitoring" ? !opts.noMonitoring : key === "notifications"),
		get: (key: string) => (key === "monitoring" ? monitoring : [notifications]),
	} as unknown as PluginLoader;
	return { notifications, monitoring, loader };
}

const loaded = { resolved: { name: "holocron" }, filepath: "/x/holocron.config.ts" } as unknown as LoadedConfig;
function run(f: ReturnType<typeof fakes>, over: Partial<Parameters<typeof runSyncIncidents>[0]> = {}) {
	const lines: string[] = [];
	const promise = runSyncIncidents({
		loaded,
		context: { repoRoot: "/repo" },
		loader: f.loader,
		yes: true,
		print: (l) => lines.push(l),
		now: new Date("2026-11-23T00:00:00Z"),
		...over,
	});
	return { promise, lines };
}

describe("runSyncIncidents", () => {
	it("makes the post and appends its update for a new incident", async () => {
		const f = fakes();
		const { status, counts } = await run(f).promise;
		expect(status).toBe("ok");
		expect(counts).toMatchObject({ created: 1, updated: 0, failed: 0 });
		const rendered = renderIncident(incident(), statusPage);
		expect(f.notifications.ensureDiscussion).toHaveBeenCalledWith({
			channel: "incidents",
			key: "The Holocron#i1",
			title: rendered.title,
			body: rendered.body,
			state: "investigating",
			quiet: true,
		});
		expect(f.notifications.postDiscussionMessage).toHaveBeenCalledWith(
			"incidents",
			"The Holocron#i1",
			renderIncidentUpdate(incident().updates[0]!),
			{ quiet: true }
		);
		expect(f.notifications.dedupeDiscussion).toHaveBeenCalledWith("incidents", "The Holocron#i1", {
			refresh: true,
		});
		expect(f.notifications.updateDiscussion).not.toHaveBeenCalled();
	});

	it("reads incidents since two days back by default, or since the given time", async () => {
		const f = fakes();
		await run(f).promise;
		expect(f.monitoring.listIncidents).toHaveBeenCalledWith({
			statusPage: "The Holocron",
			since: "2026-11-21T00:00:00.000Z",
		});
		await run(f, { since: "2026-11-01T00:00:00.000Z" }).promise;
		expect(f.monitoring.listIncidents).toHaveBeenLastCalledWith({
			statusPage: "The Holocron",
			since: "2026-11-01T00:00:00.000Z",
		});
	});

	it("does nothing for an incident whose post is in step", async () => {
		const i = incident();
		const messages = [renderIncidentUpdate(i.updates[0]!), `${renderIncident(i, statusPage).body}\n-# sync: k | s`];
		const f = fakes({ post: { url: "u", title: i.title, state: "investigating" }, messages });
		const { promise, lines } = run(f);
		const { status, counts } = await promise;
		expect(status).toBe("ok");
		expect(counts).toMatchObject({ unchanged: 1, created: 0, updated: 0 });
		expect(lines.join("\n")).toMatch(/in step/);
		expect(f.notifications.postDiscussionMessage).not.toHaveBeenCalled();
	});

	it("appends a new update, rewrites the summary, retags and closes a resolved incident", async () => {
		const before = incident();
		const resolved = incident({
			status: "resolved",
			resolvedAt: "2026-11-20T11:00:00Z",
			durationSeconds: 3600,
			updates: [...before.updates, { id: "u2", status: "resolved", text: "fixed", at: "2026-11-20T11:00:00Z" }],
		});
		const messages = [
			renderIncidentUpdate(before.updates[0]!),
			`${renderIncident(before, statusPage).body}\n-# sync`,
		];
		const f = fakes({
			incidents: [resolved],
			post: { url: "u", title: before.title, state: "investigating" },
			messages,
		});
		const { counts } = await run(f).promise;
		expect(counts).toMatchObject({ updated: 1, created: 0 });
		expect(f.notifications.updateDiscussion).toHaveBeenNthCalledWith(1, "incidents", "The Holocron#i1", {
			title: "Sentinel is down",
			body: renderIncident(resolved, statusPage).body,
			state: "resolved",
		});
		expect(f.notifications.postDiscussionMessage).toHaveBeenCalledTimes(1);
		expect(f.notifications.updateDiscussion).toHaveBeenLastCalledWith("incidents", "The Holocron#i1", {
			closed: true,
		});
	});

	it("opens a closed post again for an incident that is reopened", async () => {
		const open = incident();
		const messages = [renderIncidentUpdate(open.updates[0]!), `${renderIncident(open, statusPage).body}\n-# sync`];
		const f = fakes({ post: { url: "u", title: open.title, state: "investigating", closed: true }, messages });
		await run(f).promise;
		expect(f.notifications.updateDiscussion).toHaveBeenCalledWith(
			"incidents",
			"The Holocron#i1",
			expect.objectContaining({ closed: false })
		);
	});

	it("posts only what the kept post lacks when another run made the post first", async () => {
		const f = fakes({
			notifications: {
				dedupeDiscussion: vi.fn(async () => 1),
				readDiscussionMessages: vi.fn(async () => ["said\n-# update: u1"]),
			},
		});
		await run(f).promise;
		expect(f.notifications.postDiscussionMessage).not.toHaveBeenCalled();
	});

	it("posts only what a post that already existed lacks when the create finds it", async () => {
		const f = fakes({
			notifications: {
				ensureDiscussion: vi.fn(async () => ({ post: { url: "u" }, created: false })),
				readDiscussionMessages: vi.fn(async () => ["said\n-# update: u1"]),
			},
		});
		await run(f).promise;
		expect(f.notifications.postDiscussionMessage).not.toHaveBeenCalled();
	});

	it("writes nothing on a dry run and says what it would do", async () => {
		const f = fakes();
		const { promise, lines } = run(f, { context: { repoRoot: "/repo", dryRun: true }, yes: false });
		expect((await promise).status).toBe("ok");
		expect(lines.join("\n")).toMatch(/would create post; append update u1/);
		expect(f.notifications.ensureDiscussion).not.toHaveBeenCalled();
	});

	it("asks first and stops on no; refuses without a terminal or --yes", async () => {
		const f = fakes();
		const no = await run(f, { yes: false, interactive: true, confirm: async () => false }).promise;
		expect(no.status).toBe("cancelled");
		expect(f.notifications.ensureDiscussion).not.toHaveBeenCalled();
		await expect(run(f, { yes: false, interactive: false }).promise).rejects.toThrow(/pass --yes/);
		const yes = await run(f, { yes: false, interactive: true, confirm: async () => true }).promise;
		expect(yes.status).toBe("ok");
	});

	it("stops cleanly at a rate limit and counts what is left", async () => {
		const limit = new ProviderApiError("discord", 429, "Too Many Requests", '{"retry_after": 2}');
		const f = fakes({
			incidents: [incident(), incident({ id: "i2" })],
			notifications: { ensureDiscussion: vi.fn(async () => Promise.reject(limit)) },
		});
		const { promise, lines } = run(f);
		const { status, counts } = await promise;
		expect(status).toBe("ok");
		expect(counts).toMatchObject({ created: 0, left: 2, failed: 0 });
		expect(lines.join("\n")).toMatch(/rate limiting; 2 incident\(s\) are left/);
	});

	it("fails an incident whose write is refused and goes on with the next", async () => {
		const ensure = vi
			.fn()
			.mockRejectedValueOnce(new ProviderApiError("discord", 403, "Forbidden", "Missing Access"))
			.mockResolvedValueOnce({ post: { url: "u" }, created: true });
		const f = fakes({
			incidents: [incident(), incident({ id: "i2" })],
			notifications: { ensureDiscussion: ensure },
		});
		const { status, counts } = await run(f).promise;
		expect(status).toBe("fail");
		expect(counts).toMatchObject({ created: 1, failed: 1 });
	});

	it("fails an incident whose post cannot be read", async () => {
		const f = fakes({ notifications: { readDiscussion: vi.fn(async () => Promise.reject(new Error("boom"))) } });
		const { status, counts } = await run(f).promise;
		expect(status).toBe("fail");
		expect(counts?.failed).toBe(1);
	});

	it("is a quiet skip when nothing is configured for it", async () => {
		expect(
			(await run(fakes({ layout: { categories: [{ name: "A", channels: [{ name: "x" }] }] } })).promise).status
		).toBe("skip");
		expect((await run(fakes({ noMonitoring: true })).promise).status).toBe("skip");
		const none = fakes({ incidents: [] });
		const empty = await run(none).promise;
		expect(empty).toMatchObject({ status: "ok", plans: [] });
	});

	it("fails when the feed names a page that is not declared, or `true` is ambiguous", async () => {
		expect((await run(fakes({ pages: [{ name: "Other" }] })).promise).reason).toMatch(/does not declare/);
		const bare: NotificationsLayout = {
			categories: [{ name: "OPS", channels: [{ name: "incidents", kind: "forum", feeds: { incidents: true } }] }],
		};
		expect((await run(fakes({ layout: bare, pages: [] })).promise).reason).toMatch(/no status page is declared/);
		expect((await run(fakes({ layout: bare, pages: [PAGE, { name: "B" }] })).promise).reason).toMatch(
			/2 status pages/
		);
		const one = fakes({ layout: bare });
		expect((await run(one).promise).status).toBe("ok");
		const two: NotificationsLayout = {
			categories: [
				{
					name: "OPS",
					channels: [
						{ name: "a", kind: "forum", feeds: { incidents: true } },
						{ name: "b", kind: "forum", feeds: { incidents: true } },
					],
				},
			],
		};
		expect((await run(fakes({ layout: two })).promise).reason).toMatch(/several forums/);
	});

	it("skips for a plan that refuses the read, and fails for any other error", async () => {
		const refused = fakes({
			list: async () => Promise.reject(new ProviderApiError("checkly", 403, "Forbidden", "plan")),
		});
		expect((await run(refused).promise).status).toBe("skip");
		const broken = fakes({ list: async () => Promise.reject(new Error("down")) });
		expect((await run(broken).promise).status).toBe("fail");
	});
});
