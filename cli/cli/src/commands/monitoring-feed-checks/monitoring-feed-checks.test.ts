import { describe, expect, it, vi } from "vitest";

import {
	MissingTokenError,
	type MonitoringAlertChannelState,
	type NotificationsLayout,
	type ServerInspection,
} from "../../plugin/index.js";
import { monitoringFeedChecks } from "./monitoring-feed-checks.js";
import type { MonitoringFeedChecksInput } from "./monitoring-feed-checks.type.js";

const TOKEN = "sentinel-webhook-token";
const layout = (feed: unknown = true, extra: Partial<NotificationsLayout> = {}): NotificationsLayout => ({
	categories: [
		{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: feed as never } }, { name: "plain" }] },
	],
	...extra,
});
const server = (over: Partial<ServerInspection["channels"][number]> = {}): ServerInspection => ({
	categories: ["ALERTS"],
	channels: [
		{
			name: "uptime",
			category: "ALERTS",
			webhooks: ["Checkly"],
			webhookAvatars: ["Checkly"],
			webhookIds: { checkly: "1234567" },
			...over,
		},
	],
	roles: [],
});
const GOOD: MonitoringAlertChannelState = {
	exists: true,
	discord: true,
	webhookId: "1234567",
	unsubscribed: [],
	deactivated: [],
};
const provider = (inspect?: MonitoringAlertChannelState | Error | "none", icon = true) => ({
	providerName: "checkly",
	...(icon ? { icon: { url: "https://example.com/checkly.png" } } : {}),
	...(inspect === "none"
		? {}
		: {
				inspectAlertChannel: vi.fn(async () => {
					if (inspect instanceof Error) throw inspect;
					return inspect ?? GOOD;
				}),
			}),
});
const run = (over: Partial<MonitoringFeedChecksInput> = {}) =>
	monitoringFeedChecks({
		layout: layout(),
		monitoring: provider(),
		missingReason: "no `monitoring` provider is configured",
		found: server(),
		...over,
	});
const ids = ["monitoring-feed-webhook", "monitoring-alert-channel", "monitoring-subscriptions"];
const row = (rows: Awaited<ReturnType<typeof run>>, id: string) => rows.find((r) => r.id === id)!;

describe("monitoringFeedChecks", () => {
	it("adds no rows when no channel has a monitoring feed", async () => {
		expect(await run({ layout: { categories: [{ name: "A", channels: [{ name: "plain" }] }] } })).toEqual([]);
		expect(await run({ layout: {} })).toEqual([]);
		expect(await run({ layout: { categories: [{ name: "A" }] } })).toEqual([]);
	});

	it("passes all three steps when the webhook, the alert channel and the subscriptions are as declared", async () => {
		const rows = await run();
		expect(rows.map((r) => [r.id, r.status])).toEqual(ids.map((id) => [id, "pass"]));
		expect(row(rows, "monitoring-alert-channel").detail).toBe("1 of 1 as declared");
	});

	it("skips every step, with the reason, when there is no monitoring provider or the server cannot be read", async () => {
		const none = await run({ monitoring: undefined, missingReason: "checkly failed to load (no token)" });
		expect(none.map((r) => [r.status, r.detail])).toEqual(
			ids.map(() => ["skip", "checkly failed to load (no token)"])
		);
		const unread = await run({ found: undefined });
		expect(unread.every((r) => r.status === "skip" && r.detail.includes("could not read the server"))).toBe(true);
	});

	describe("feed webhook", () => {
		it("fails when the channel, the webhook or its picture is missing, or its webhooks could not be listed", async () => {
			const noChannel = await run({ found: { ...server(), channels: [] } });
			expect(row(noChannel, "monitoring-feed-webhook").problems).toEqual([
				"#uptime: no channel to hold the feed webhook",
			]);
			const noHook = await run({ found: server({ webhooks: [], webhookAvatars: [] }) });
			expect(row(noHook, "monitoring-feed-webhook").problems).toEqual(["#uptime: no webhook named Checkly"]);
			const noPicture = await run({ found: server({ webhookAvatars: [] }) });
			expect(row(noPicture, "monitoring-feed-webhook").problems).toEqual([
				"#uptime: webhook Checkly has no picture",
			]);
			const noList = await run({ found: server({ webhooks: [], webhooksError: "403" }) });
			expect(row(noList, "monitoring-feed-webhook").problems).toEqual([
				"#uptime: could not list its webhooks (403)",
			]);
		});

		it("expects a picture only when the layout or the provider gives one", async () => {
			const bare = await run({ monitoring: provider(GOOD, false), found: server({ webhookAvatars: undefined }) });
			expect(row(bare, "monitoring-feed-webhook").status).toBe("pass");
			const declared = await run({
				layout: layout(true, { webhookAvatar: "https://example.com/a.png" }),
				monitoring: provider(GOOD, false),
				found: server({ webhookAvatars: undefined }),
			});
			expect(row(declared, "monitoring-feed-webhook").problems).toEqual([
				"#uptime: webhook Checkly has no picture",
			]);
		});

		it("uses the webhook name the layout gives", async () => {
			const rows = await run({
				layout: layout({ webhook: "Uptime", name: "Alerts to #uptime" }),
				found: server({ webhooks: ["Uptime"], webhookAvatars: ["Uptime"], webhookIds: { uptime: "1234567" } }),
			});
			expect(rows.map((r) => r.status)).toEqual(["pass", "pass", "pass"]);
		});
	});

	describe("alert channel", () => {
		it("fails for a missing channel, a channel not formatted for Discord, and a URL that is not a Discord webhook", async () => {
			const missing = await run({ monitoring: provider({ exists: false, unsubscribed: [], deactivated: [] }) });
			expect(row(missing, "monitoring-alert-channel").problems).toEqual([
				"#uptime: missing alert channel Message to #uptime",
			]);
			const other = await run({ monitoring: provider({ ...GOOD, discord: false, webhookId: undefined }) });
			expect(row(other, "monitoring-alert-channel").problems).toEqual([
				"#uptime: Message to #uptime is not formatted for Discord",
				"#uptime: Message to #uptime does not post to a Discord webhook URL",
			]);
		});

		it("fails when it posts through another webhook, and does not compare when the feed webhook has no id", async () => {
			const wrong = await run({ monitoring: provider({ ...GOOD, webhookId: "999" }) });
			expect(row(wrong, "monitoring-alert-channel").problems).toEqual([
				"#uptime: Message to #uptime posts through a different webhook than Checkly",
			]);
			const unknown = await run({
				monitoring: provider({ ...GOOD, webhookId: "999" }),
				found: server({ webhookIds: undefined }),
			});
			expect(row(unknown, "monitoring-alert-channel").status).toBe("pass");
		});

		it("skips it, and the subscriptions, when the provider cannot read its alert channels or has no token", async () => {
			const cannot = await run({ monitoring: provider("none") });
			expect(cannot.map((r) => r.status)).toEqual(["pass", "skip", "skip"]);
			expect(row(cannot, "monitoring-alert-channel").detail).toBe(
				"the `checkly` provider cannot read its alert channels"
			);
			const token = await run({ monitoring: provider(new MissingTokenError("no Checkly token set")) });
			expect(token.map((r) => r.status)).toEqual(["pass", "skip", "skip"]);
			expect(row(token, "monitoring-alert-channel").detail).toContain("Checkly");
		});

		it("stops reading after the first channel when it is skipped, and reports any other error as a problem", async () => {
			const two: NotificationsLayout = {
				categories: [
					{
						name: "ALERTS",
						channels: [
							{ name: "uptime", feeds: { monitoring: true } },
							{ name: "uptime2", feeds: { monitoring: { name: "Second" } } },
						],
					},
				],
			};
			const monitoring = provider(new MissingTokenError("no token"));
			const rows = await run({
				layout: two,
				monitoring,
				found: {
					...server(),
					channels: [
						...server().channels,
						{ name: "uptime2", category: "ALERTS", webhooks: [], webhookAvatars: [] },
					],
				},
			});
			expect(monitoring.inspectAlertChannel).toHaveBeenCalledTimes(1);
			expect(row(rows, "monitoring-alert-channel").status).toBe("skip");
			const boom = await run({ monitoring: provider(new Error("boom")) });
			expect(row(boom, "monitoring-alert-channel").problems).toEqual(["#uptime: boom"]);
		});
	});

	describe("subscriptions", () => {
		it("names each check the channel lacks or has switched off", async () => {
			const rows = await run({
				monitoring: provider({ ...GOOD, unsubscribed: ["check c"], deactivated: ["check b"] }),
			});
			expect(row(rows, "monitoring-subscriptions").problems).toEqual([
				"#uptime: Message to #uptime is not subscribed to check c",
				"#uptime: Message to #uptime has check b switched off",
			]);
		});
	});

	it("never puts a webhook URL or token in a row", async () => {
		const rows = await run({ monitoring: provider({ ...GOOD, webhookId: "999", unsubscribed: ["x"] }) });
		expect(JSON.stringify(rows)).not.toContain(TOKEN);
	});
});
