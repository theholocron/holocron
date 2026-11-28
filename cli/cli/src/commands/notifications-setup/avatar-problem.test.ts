import { describe, expect, it } from "vitest";

import { avatarProblem } from "./avatar-problem.js";

describe("avatarProblem", () => {
	it("has no problem with an absent picture or a single path or URL", () => {
		expect(avatarProblem("x", "webhook.avatar", undefined)).toBeUndefined();
		expect(avatarProblem("x", "webhook.avatar", "media/a.png")).toBeUndefined();
	});

	it("refuses a null a config wrote, with or without a channel", () => {
		expect(avatarProblem("x", "webhook.avatar", null)).toBe(
			"channel `x`: `webhook.avatar` must be a path or an https:// URL, or `{ url, image }`"
		);
		expect(avatarProblem(undefined, "webhookAvatar", null)).toBe(
			"`webhookAvatar` must be a path or an https:// URL, or `{ url, image }`"
		);
	});

	it("refuses an empty picture and a url that is not https", () => {
		expect(avatarProblem(undefined, "webhookAvatar", {})).toBe(
			"`webhookAvatar` needs a `url`, an `image`, or both"
		);
		expect(avatarProblem(undefined, "webhookAvatar", { url: "media/a.png" })).toBe(
			"`webhookAvatar.url` must be an https:// URL"
		);
	});

	it("refuses an image that has any URI scheme, a data: image included", () => {
		for (const image of [
			"https://cdn.example.com/a.png",
			"HTTP://cdn.example.com/a.png",
			"data:image/png;base64,iVBORw0KGgo=",
			"file:///etc/a.png",
		]) {
			expect(avatarProblem(undefined, "webhookAvatar", { image })).toBe(
				"`webhookAvatar.image` must be a file in the repo, not a URL"
			);
		}
	});

	it("accepts an image that is a file path, a Windows drive path included", () => {
		for (const image of ["media/a.png", "./a.png", "C:\\media\\a.png"]) {
			expect(avatarProblem(undefined, "webhookAvatar", { image })).toBeUndefined();
		}
	});
});
