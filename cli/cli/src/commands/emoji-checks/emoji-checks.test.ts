import { describe, expect, it } from "vitest";

import type { NotificationsLayout, ServerInspection } from "../../plugin/index.js";
import { emojiChecks } from "./emoji-checks.js";

const layout = (defaultReaction: unknown, starterReactions?: unknown[]): NotificationsLayout =>
	({
		categories: [{ name: "BUILD", channels: [{ name: "prs", kind: "forum", defaultReaction, starterReactions }] }],
	}) as NotificationsLayout;

const found = (over: Partial<ServerInspection>): ServerInspection => ({
	categories: [],
	channels: [],
	roles: [],
	...over,
});

describe("emojiChecks", () => {
	it("has no row when no reaction names a server emoji", () => {
		expect(emojiChecks({ layout: layout("🔀", ["✅"]), found: found({}) })).toEqual([]);
		expect(emojiChecks({ layout: {}, found: undefined })).toEqual([]);
	});

	it("passes when every emoji is on the server", () => {
		const [row] = emojiChecks({
			layout: layout(":git_merge:", [":git_branch:", "✅"]),
			found: found({ emojis: ["git_merge", "git_branch", "other"] }),
		});
		expect(row).toMatchObject({ id: "emoji", status: "pass", detail: "2 of 2 on the server", problems: [] });
	});

	it("fails by name for each missing emoji, and says setup makes one that has an image", () => {
		const [row] = emojiChecks({
			layout: layout({ emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" }, [":git_branch:"]),
			found: found({ emojis: [] }),
		});
		expect(row?.status).toBe("fail");
		expect(row?.problems).toEqual([
			":git_merge: is not on the server; `setup notifications` makes it from .holocron/media/emoji/git_merge.png",
			":git_branch: is not on the server; add it in the server's settings, or give the reaction an `image` for `setup notifications` to make it from",
		]);
	});

	it("expects the emoji a forum's tags name, and fails the one the server lacks", () => {
		const tagged = {
			categories: [
				{
					name: "BUILD",
					channels: [
						{
							name: "prs",
							kind: "forum",
							tags: [
								{ name: "merged", emoji: ":git_merge:" },
								{ name: "x", emoji: "❌" },
							],
						},
					],
				},
			],
		} as NotificationsLayout;
		expect(emojiChecks({ layout: tagged, found: found({ emojis: ["git_merge"] }) })[0]).toMatchObject({
			status: "pass",
			detail: "1 of 1 on the server",
		});
		expect(emojiChecks({ layout: tagged, found: found({ emojis: [] }) })[0]?.problems).toHaveLength(1);
	});

	it("treats no emoji list as an empty server", () => {
		const [row] = emojiChecks({ layout: layout(":git_merge:"), found: found({}) });
		expect(row?.status).toBe("fail");
	});

	it("skips, never silently passes, when the server or its emoji could not be read", () => {
		const [unread] = emojiChecks({ layout: layout(":git_merge:"), found: undefined });
		expect(unread).toMatchObject({ id: "emoji", status: "skip", detail: "not checked: could not read the server" });
		const [failed] = emojiChecks({ layout: layout(":git_merge:"), found: found({ emojisError: "HTTP 500" }) });
		expect(failed?.status).toBe("skip");
		expect(failed?.detail).toMatch(/could not read the server's emoji \(HTTP 500\)/);
	});
});
