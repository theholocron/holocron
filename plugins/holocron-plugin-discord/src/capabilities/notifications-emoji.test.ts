import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChannelType, createDiscordBotClient, createDiscordClient, permissions } from "../rest.js";
import { DiscordNotifications, type DiscordNotificationsOptions } from "./notifications.js";

const BASE = "https://discord.test/api/v10";
const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";
const GUILD = "1303969001822486568";
const bot = { body: { id: "9001", username: "holonet", bot: true } };

function make(responses: Parameters<typeof stubFetch>[0], opts: DiscordNotificationsOptions = { guildId: GUILD }) {
	const { fetch, calls } = stubFetch(responses);
	const botClient = createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch });
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return {
		notifs: new DiscordNotifications(
			client,
			opts,
			() => WEBHOOK,
			() => botClient
		),
		calls,
	};
}

const MERGE = { id: "900", name: "git_merge", animated: false };
const custom = { emoji_id: "900", emoji_name: null };
const forum = (reaction: unknown, id = "2010", name = "prs") => ({
	id,
	name,
	type: ChannelType.Forum,
	available_tags: [],
	default_reaction_emoji: reaction,
});
const prs = (defaultReaction: string) => ({
	categories: [{ name: "BUILD", channels: [{ name: "prs", kind: "forum" as const, defaultReaction }] }],
});

describe("DiscordNotifications server emoji: default reaction", () => {
	it("creates a forum whose default reaction is a server emoji, by id", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: [MERGE] }, { body: forum(custom) }]);
		await notifs.ensureChannel({ name: "prs", kind: "forum", defaultReaction: ":git_merge:" });
		expect(calls[2]?.body).toEqual({ name: "prs", type: ChannelType.Forum, default_reaction_emoji: custom });
	});

	it("takes the object form the same way", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: [MERGE] }, { body: forum(custom) }]);
		await notifs.ensureChannel({
			name: "prs",
			kind: "forum",
			defaultReaction: { emoji: ":git_merge:", image: ".holocron/media/git_merge.png" },
		});
		expect(calls[2]?.body).toMatchObject({ default_reaction_emoji: custom });
	});

	it("names the emoji when the server has none, and writes nothing", async () => {
		const { notifs, calls } = make([
			{ body: [] },
			{
				body: [
					{ id: "1", name: "other" },
					{ id: null, name: "x" },
				],
			},
		]);
		const err = await notifs
			.ensureChannel({ name: "prs", kind: "forum", defaultReaction: ":git_merge:" })
			.catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/no emoji named `:git_merge:`/);
		expect(calls).toHaveLength(2);
	});

	it("changes a different default reaction", async () => {
		const unicode = make([
			{ body: [forum({ emoji_id: null, emoji_name: "🔀" })] },
			{ body: [MERGE] },
			{ body: forum(custom) },
		]);
		const result = await unicode.notifs.ensureChannel({
			name: "prs",
			kind: "forum",
			defaultReaction: ":git_merge:",
		});
		expect(result.updated).toEqual(["default reaction"]);
		expect(unicode.calls[2]).toMatchObject({ method: "PATCH", body: { default_reaction_emoji: custom } });

		const other = make([
			{ body: [forum({ emoji_id: "901", emoji_name: null })] },
			{ body: [MERGE] },
			{ body: forum(custom) },
		]);
		expect(
			(await other.notifs.ensureChannel({ name: "prs", kind: "forum", defaultReaction: ":git_merge:" })).updated
		).toEqual(["default reaction"]);
	});

	it("leaves the same emoji alone whether or not Discord echoes its name", async () => {
		for (const have of [custom, { emoji_id: "900", emoji_name: "git_merge" }]) {
			const same = make([{ body: [forum(have)] }, { body: [MERGE] }]);
			const result = await same.notifs.ensureChannel({
				name: "prs",
				kind: "forum",
				defaultReaction: ":git_merge:",
			});
			expect(result.updated).toBeUndefined();
			expect(same.calls).toHaveLength(2);
		}
	});

	it("puts a Unicode default reaction back over a server emoji", async () => {
		const { notifs, calls } = make([
			{ body: [forum(custom)] },
			{ body: forum({ emoji_id: null, emoji_name: "🔀" }) },
		]);
		const result = await notifs.ensureChannel({ name: "prs", kind: "forum", defaultReaction: "🔀" });
		expect(result.updated).toEqual(["default reaction"]);
		expect(calls[1]?.body).toEqual({ default_reaction_emoji: { emoji_id: null, emoji_name: "🔀" } });
	});
});

describe("DiscordNotifications.ensureEmoji", () => {
	const image = "data:image/png;base64,AAAA";

	it("leaves an existing emoji exactly as it is", async () => {
		const { notifs, calls } = make([{ body: [MERGE] }]);
		expect(await notifs.ensureEmoji({ name: "git_merge", image })).toEqual({ id: "900", created: false });
		expect(calls).toHaveLength(1);
	});

	it("makes a missing one from the image", async () => {
		const { notifs, calls } = make([{ body: [] }, { body: MERGE }]);
		expect(await notifs.ensureEmoji({ name: "git_merge", image })).toEqual({ id: "900", created: true });
		expect(calls[1]).toMatchObject({
			method: "POST",
			url: `${BASE}/guilds/${GUILD}/emojis`,
			body: { name: "git_merge", image },
		});
	});

	it("says the bot lacks Create Guild Expressions, with the invite link that asks for it", async () => {
		const layout = {
			categories: [
				{
					name: "A",
					channels: [
						{
							name: "prs",
							kind: "forum" as const,
							defaultReaction: { emoji: ":git_merge:", image: ".holocron/media/a.png" },
						},
					],
				},
			],
		};
		const { notifs } = make(
			[{ body: [] }, { status: 403, body: { message: "Missing Permissions", code: 50013 } }, bot],
			{ guildId: GUILD, layout }
		);
		const err = (await notifs.ensureEmoji({ name: "git_merge", image }).catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(/lacks Create Guild Expressions/);
		const url = new URL(err.message.match(/https:\/\/discord\.com\/oauth2\/authorize\S+/)![0]);
		const bits = BigInt(url.searchParams.get("permissions")!);
		expect((bits & BigInt(permissions(["CreateGuildExpressions"]))) !== 0n).toBe(true);
	});

	it("passes another failure through", async () => {
		const { notifs } = make([{ body: [] }, { status: 400, body: { message: "Invalid Form Body" } }]);
		await expect(notifs.ensureEmoji({ name: "git_merge", image })).rejects.toThrow();
	});
});

describe("DiscordNotifications.inspect: server emoji", () => {
	it("spells a server emoji default reaction as :name: and lists the emoji", async () => {
		const { notifs } = make([
			{ body: [forum(custom)] },
			{
				body: [MERGE, { id: null, name: "x" }, { id: "5", name: null }],
			},
		]);
		const found = await notifs.inspect(prs(":git_merge:"));
		expect(found.emojis).toEqual(["git_merge"]);
		expect(found.channels.find((c) => c.name === "prs")?.defaultReaction).toBe(":git_merge:");
	});

	it("names an emoji id the server no longer has", async () => {
		const { notifs } = make([{ body: [forum({ emoji_id: "777", emoji_name: null })] }, { body: [MERGE] }]);
		expect((await notifs.inspect(prs(":git_merge:"))).channels[0]?.defaultReaction).toBe("custom emoji 777");
	});

	it("reads no emoji when no reaction names one", async () => {
		const { notifs, calls } = make([{ body: [forum(custom)] }]);
		const found = await notifs.inspect(prs("🔀"));
		expect(found.emojis).toBeUndefined();
		expect(calls.some((c) => c.url.endsWith("/emojis"))).toBe(false);
	});

	it("reports an emoji list it could not read", async () => {
		const { notifs } = make([{ body: [forum(null)] }, { status: 500, body: { message: "boom" } }]);
		const found = await notifs.inspect(prs(":git_merge:"));
		expect(found.emojisError).toBeDefined();
		expect(found.emojis).toBeUndefined();
	});
});

describe("DiscordNotifications starter reactions with server emoji", () => {
	const FORUM = {
		id: "2010",
		name: "ideas",
		type: ChannelType.Forum,
		available_tags: [{ id: "902", name: "proposed", moderated: true, emoji_id: null, emoji_name: null }],
	};
	const post = {
		id: "5",
		name: "SPEC: A",
		type: 11,
		parent_id: "2010",
		applied_tags: ["902"],
		thread_metadata: {
			archived: false,
			auto_archive_duration: 10080,
			archive_timestamp: "2026-10-01T00:00:00.000Z",
			locked: false,
		},
	};
	const input = { channel: "ideas", key: ".notes/a.spec.md", title: "SPEC: A", body: "About A.", state: "proposed" };
	const start = (reactions: Array<string | { emoji: string }>, emojis: Parameters<typeof stubFetch>[0][number]) =>
		make(
			[
				{ body: [FORUM] },
				{ body: { threads: [], members: [] } },
				{ body: { threads: [], has_more: false } },
				{ body: post },
				emojis,
				{ status: 204 },
				{ status: 204 },
			],
			{
				guildId: GUILD,
				layout: { categories: [{ name: "BUILD", channels: [{ name: "ideas", starterReactions: reactions }] }] },
			}
		);

	it("adds a server emoji as name:id and a Unicode one as itself", async () => {
		const { notifs, calls } = start([":git_merge:", "👍", { emoji: ":git_merge:" }], { body: [MERGE] });
		await notifs.ensureDiscussion(input);
		const puts = calls.filter((c) => c.method === "PUT").map((c) => c.url);
		const merge = `${BASE}/channels/5/messages/5/reactions/${encodeURIComponent("git_merge:900")}/@me`;
		expect(puts).toEqual([merge, `${BASE}/channels/5/messages/5/reactions/${encodeURIComponent("👍")}/@me`, merge]);
	});

	it("leaves out an emoji the server lacks, and still makes the post", async () => {
		const missing = start([":git_merge:", "👍"], { body: [] });
		expect((await missing.notifs.ensureDiscussion(input)).created).toBe(true);
		expect(missing.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
	});

	it("leaves them all out when the emoji list cannot be read, and still makes the post", async () => {
		const failed = start([":git_merge:"], { status: 500, body: { message: "boom" } });
		expect((await failed.notifs.ensureDiscussion(input)).created).toBe(true);
		expect(failed.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
	});
});
