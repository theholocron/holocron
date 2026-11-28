import { describe, expect, it } from "vitest";

import type { NotificationsLayout, ServerInspection } from "../../plugin/index.js";
import { INCIDENT_FEED_TAGS } from "../notifications-setup/index.js";
import { incidentFeedChecks } from "./incident-feed-checks.js";

const layout: NotificationsLayout = {
	categories: [
		{ name: "OPS", channels: [{ name: "incidents", kind: "forum", feeds: { incidents: "The Holocron" } }] },
	],
};
const server = (over: Partial<ServerInspection["channels"][number]> = {}): ServerInspection => ({
	categories: ["OPS"],
	channels: [
		{
			name: "incidents",
			category: "OPS",
			kind: "forum",
			tags: INCIDENT_FEED_TAGS.map((name) => ({ name })),
			webhooks: [],
			botThreads: { post: true, manage: true },
			...over,
		},
	],
	roles: [],
});

describe("incidentFeedChecks", () => {
	it("adds no rows when no channel has feeds.incidents", () => {
		expect(incidentFeedChecks({ layout: {}, found: server() })).toEqual([]);
	});

	it("passes when the forum, the five tags and the bot's permissions are right", () => {
		expect(incidentFeedChecks({ layout, found: server() }).map((r) => [r.id, r.status])).toEqual([
			["incident-feed-forum", "pass"],
			["incident-feed-tags", "pass"],
			["incident-feed-bot", "pass"],
		]);
	});

	it("names a missing tag and a bot that cannot manage threads", () => {
		const rows = incidentFeedChecks({
			layout,
			found: server({ tags: [{ name: "investigating" }], botThreads: { post: true, manage: false } }),
		});
		expect(rows[1]?.problems).toContain('#incidents: tag "maintenance" is missing');
		expect(rows[2]?.problems).toEqual(["#incidents: the bot cannot manage threads in it (Manage Threads)"]);
	});

	it("skips when the server could not be read", () => {
		expect(incidentFeedChecks({ layout, found: undefined }).map((r) => r.status)).toEqual(["skip", "skip", "skip"]);
	});
});
