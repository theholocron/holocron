import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../../plugin/index.js";
import { layoutPictureProblem } from "./layout-picture-problem.js";

describe("layoutPictureProblem", () => {
	const onChannel = (webhook: unknown): NotificationsLayout => ({
		categories: [{ name: "A", channels: [{ name: "x", webhook } as never] }],
	});

	it("accepts a picture given as a path, a url, an image or both, on the layout or a webhook", () => {
		for (const avatar of [
			"media/a.png",
			{ url: "https://cdn.example.com/a.png" },
			{ image: "media/a.png" },
			{ url: "https://cdn.example.com/a.png", image: "media/a.png" },
		]) {
			expect(layoutPictureProblem({ webhookAvatar: avatar })).toBeUndefined();
			expect(layoutPictureProblem(onChannel({ avatar }))).toBeUndefined();
		}
	});

	it("has no problem for a layout with no pictures, no categories, or webhooks that are only switched on", () => {
		expect(layoutPictureProblem({})).toBeUndefined();
		expect(layoutPictureProblem({ categories: [{ name: "A" }] })).toBeUndefined();
		expect(layoutPictureProblem(onChannel(true))).toBeUndefined();
		expect(layoutPictureProblem(onChannel(null))).toBeUndefined();
	});

	it("refuses a layout picture that is empty, whose url is not https, or whose image is not a file", () => {
		expect(layoutPictureProblem({ webhookAvatar: {} })).toBe("`webhookAvatar` needs a `url`, an `image`, or both");
		expect(layoutPictureProblem(onChannel({ avatar: { url: "http://cdn.example.com/a.png" } }))).toBe(
			"channel `x`: `webhook.avatar.url` must be an https:// URL"
		);
		expect(layoutPictureProblem({ webhookAvatar: { image: "https://cdn.example.com/a.png" } })).toBe(
			"`webhookAvatar.image` must be a file in the repo, not a URL"
		);
	});

	it("refuses a null picture instead of throwing", () => {
		const message = "must be a path or an https:// URL, or `{ url, image }`";
		expect(layoutPictureProblem({ webhookAvatar: null as never })).toContain(message);
		expect(layoutPictureProblem(onChannel({ avatar: null }))).toContain("channel `x`: `webhook.avatar`");
	});
});
