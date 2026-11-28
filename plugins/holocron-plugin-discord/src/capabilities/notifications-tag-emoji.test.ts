import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChannelType, createDiscordBotClient, createDiscordClient } from "../rest.js";
import { DiscordNotifications } from "./notifications.js";

const BASE = "https://discord.test/api/v10";
const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const botClient = createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch });
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return {
		notifs: new DiscordNotifications(
			client,
			{ guildId: "1303969001822486568" },
			() => WEBHOOK,
			() => botClient
		),
		calls,
	};
}

const MERGE = { id: "900", name: "git_merge", animated: false };
const BRANCH = { id: "901", name: "git_branch", animated: false };
const custom = { emoji_id: "900", emoji_name: null };
const forum = (tags: unknown[] = []) => ({
	id: "2010",
	name: "prs",
	type: ChannelType.Forum,
	available_tags: tags,
});
const tag = (id: string, name: string, emoji: { emoji_id: string | null; emoji_name: string | null }) => ({
	id,
	name,
	moderated: true,
	...emoji,
});

describe("DiscordNotifications server emoji on forum tags", () => {
	const WANT = [
		{ name: "merged", emoji: ":git_merge:", moderated: true },
		{ name: "failing", emoji: "❌", moderated: true },
		{ name: "plain", moderated: true },
		{ name: "merged again", emoji: ":git_merge:", moderated: true },
	];

	it("creates a forum whose tags carry a server emoji by id, a Unicode one by name, and none", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: [MERGE] }, { body: forum() }]);
		await notifs.ensureChannel({ name: "prs", kind: "forum", tags: WANT });
		expect(calls).toHaveLength(3);
		expect(calls[2]?.body).toEqual({
			name: "prs",
			type: ChannelType.Forum,
			available_tags: [
				{ name: "merged", moderated: true, emoji_id: "900", emoji_name: null },
				{ name: "failing", moderated: true, emoji_id: null, emoji_name: "❌" },
				{ name: "plain", moderated: true, emoji_id: null, emoji_name: null },
				{ name: "merged again", moderated: true, emoji_id: "900", emoji_name: null },
			],
		});
	});

	it("names a missing emoji and writes nothing", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: [BRANCH] }]);
		const err = await notifs
			.ensureChannel({ name: "prs", kind: "forum", tags: [{ name: "merged", emoji: ":git_merge:" }] })
			.catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/no emoji named `:git_merge:`/);
		expect(calls).toHaveLength(2);
	});

	it("reads no emoji when every tag is Unicode", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: forum() }]);
		await notifs.ensureChannel({ name: "prs", kind: "forum", tags: [{ name: "failing", emoji: "❌" }] });
		expect(calls.some((c) => c.url.endsWith("/emojis"))).toBe(false);
	});

	it("leaves a tag alone when it has the same server emoji, whether or not Discord echoes the name", async () => {
		for (const have of [custom, { emoji_id: "900", emoji_name: "git_merge" }]) {
			const { notifs, calls } = make([{ body: [forum([tag("7", "merged", have)])] }, { body: [MERGE] }]);
			const result = await notifs.ensureChannel({
				name: "prs",
				kind: "forum",
				tags: [{ name: "merged", emoji: ":git_merge:", moderated: true }],
			});
			expect(result.updated).toBeUndefined();
			expect(calls).toHaveLength(2);
		}
	});

	it("changes a tag whose emoji differs, in either direction, and keeps a tag the layout does not list", async () => {
		const have = [
			tag("7", "merged", { emoji_id: null, emoji_name: "🟣" }),
			tag("8", "ready", { emoji_id: "901", emoji_name: null }),
			tag("9", "failing", custom),
			tag("10", "other", { emoji_id: "900", emoji_name: "git_merge" }),
			tag("11", "bare", { emoji_id: null, emoji_name: "🔥" }),
		];
		const { notifs, calls } = make([{ body: [forum(have)] }, { body: [MERGE, BRANCH] }, { body: forum() }]);
		const result = await notifs.ensureChannel({
			name: "prs",
			kind: "forum",
			tags: [
				{ name: "merged", emoji: ":git_merge:", moderated: true },
				{ name: "ready", emoji: ":git_merge:", moderated: true },
				{ name: "failing", emoji: "❌", moderated: true },
			],
		});
		expect(result.updated).toEqual(["tags"]);
		expect(calls[2]?.body).toEqual({
			available_tags: [
				{ id: "7", name: "merged", moderated: true, emoji_id: "900", emoji_name: null },
				{ id: "8", name: "ready", moderated: true, emoji_id: "900", emoji_name: null },
				{ id: "9", name: "failing", moderated: true, emoji_id: null, emoji_name: "❌" },
				{ id: "10", name: "other", moderated: true, emoji_id: "900", emoji_name: null },
				{ id: "11", name: "bare", moderated: true, emoji_id: null, emoji_name: "🔥" },
			],
		});
	});

	it("reads a tag's server emoji back as :name:, or names an id the server lacks", async () => {
		const { notifs } = make([
			{
				body: [
					forum([
						tag("7", "merged", custom),
						tag("8", "gone", { emoji_id: "777", emoji_name: null }),
						tag("9", "failing", { emoji_id: null, emoji_name: "❌" }),
					]),
				],
			},
			{ body: [MERGE] },
		]);
		const found = await notifs.inspect({
			categories: [
				{
					name: "BUILD",
					channels: [{ name: "prs", kind: "forum", tags: [{ name: "merged", emoji: ":git_merge:" }] }],
				},
			],
		});
		expect(found.emojis).toEqual(["git_merge"]);
		expect(found.channels[0]?.tags).toEqual([
			{ name: "merged", emoji: ":git_merge:", moderated: true },
			{ name: "gone", emoji: "custom emoji 777", moderated: true },
			{ name: "failing", emoji: "❌", moderated: true },
		]);
	});
});
