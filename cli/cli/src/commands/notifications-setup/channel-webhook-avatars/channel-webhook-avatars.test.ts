import { describe, expect, it } from "vitest";

import { channelWebhookAvatars } from "./channel-webhook-avatars.js";

describe("channelWebhookAvatars", () => {
	const layout = { webhookAvatar: "media/a.png" };

	it("is the layout's picture for a channel with a webhook, or its own", () => {
		expect(channelWebhookAvatars(layout, { name: "x", webhook: true })).toEqual(["media/a.png"]);
		expect(channelWebhookAvatars(layout, { name: "x", webhook: { avatar: "own.png" } })).toEqual(["own.png"]);
	});

	it("is none for a channel without a webhook", () => {
		expect(channelWebhookAvatars(layout, { name: "x" })).toEqual([]);
		expect(channelWebhookAvatars(layout, { name: "x", webhook: false })).toEqual([]);
	});
});
