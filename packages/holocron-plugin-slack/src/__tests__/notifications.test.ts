import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { SlackNotifications } from "../capabilities/notifications.js";
import { createSlackClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://slack.test/api";
const TOKEN = "xoxb-test";

function makeNotifs(responses: Parameters<typeof stubFetch>[0], opts: { defaultChannel?: string } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createSlackClient({ token: TOKEN, baseUrl: BASE, fetch });
	return { notifs: new SlackNotifications(client, opts), calls };
}

describe("SlackNotifications.send", () => {
	it("posts to the given channel", async () => {
		const { notifs, calls } = makeNotifs([{ body: { ok: true } }]);
		await notifs.send("C123", "hello");
		expect(calls[0]?.url).toBe(`${BASE}/chat.postMessage`);
		expect(calls[0]?.body).toMatchObject({ channel: "C123", text: "hello" });
	});

	it("falls back to defaultChannel when channel is empty", async () => {
		const { notifs, calls } = makeNotifs([{ body: { ok: true } }], { defaultChannel: "C456" });
		await notifs.send("", "hello");
		expect(calls[0]?.body).toMatchObject({ channel: "C456" });
	});

	it("throws when no channel and no defaultChannel", async () => {
		const { notifs } = makeNotifs([]);
		await expect(notifs.send("", "msg")).rejects.toThrow("channel required");
	});

	it("throws ProviderApiError on Slack API error", async () => {
		const { notifs } = makeNotifs([{ body: { ok: false, error: "channel_not_found" } }]);
		await expect(notifs.send("C999", "msg")).rejects.toBeInstanceOf(ProviderApiError);
	});
});
