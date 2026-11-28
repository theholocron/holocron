import { describe, expect, it } from "vitest";

import { webhookAvatarOf } from "./webhook-avatar-of.js";

describe("webhookAvatarOf", () => {
	const layout = { webhookAvatar: { url: "https://cdn.example.com/a.png", image: "a.png" } };

	it("lists the sources of the layout's picture for a webhook with none of its own", () => {
		expect(webhookAvatarOf(layout, true)).toEqual(["https://cdn.example.com/a.png", "a.png"]);
		expect(webhookAvatarOf(layout, {})).toEqual(["https://cdn.example.com/a.png", "a.png"]);
	});

	it("prefers the webhook's own picture", () => {
		expect(webhookAvatarOf(layout, { avatar: "own.png" })).toEqual(["own.png"]);
	});

	it("names none when nothing is declared, and does not trip on a null", () => {
		expect(webhookAvatarOf({}, undefined)).toEqual([]);
		expect(webhookAvatarOf({}, null)).toEqual([]);
		expect(webhookAvatarOf({}, { avatar: null })).toEqual([]);
	});
});
