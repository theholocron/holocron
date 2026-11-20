import { stubFetch } from "@theholocron/http-client/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dataUri, solidPng } from "../__tests__/png.js";
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

describe("DiscordNotifications.ensureEmoji with replace (for a changed picture)", () => {
	const image = "data:image/png;base64,AAAA";
	const NEW = { id: "901", name: "git_merge_new" };
	const refused = { status: 403, body: { message: "Missing Permissions", code: 50013 } };
	const inviteBits = (err: Error) =>
		BigInt(
			new URL(err.message.match(/https:\/\/discord\.com\/oauth2\/authorize\S+/)![0]).searchParams.get(
				"permissions"
			)!
		);

	it("makes the new emoji first under a temporary name, deletes the old one, then renames", async () => {
		const { notifs, calls } = make([
			{ body: [MERGE] },
			{ body: NEW },
			{ status: 204 },
			{ body: { id: "901", name: "git_merge" } },
		]);
		expect(await notifs.ensureEmoji({ name: "git_merge", image, replace: true })).toEqual({
			id: "901",
			created: false,
			updated: ["image"],
		});
		expect(calls.slice(1).map((c) => [c.method, c.url.replace(BASE, ""), c.body])).toEqual([
			["POST", `/guilds/${GUILD}/emojis`, { name: "git_merge_new", image }],
			["DELETE", `/guilds/${GUILD}/emojis/900`, null],
			["PATCH", `/guilds/${GUILD}/emojis/901`, { name: "git_merge" }],
		]);
	});

	it("still only makes an emoji the server lacks, and leaves one alone without replace", async () => {
		const missing = make([{ body: [] }, { body: MERGE }]);
		expect(await missing.notifs.ensureEmoji({ name: "git_merge", image, replace: true })).toEqual({
			id: "900",
			created: true,
		});
		expect(missing.calls[1]?.body).toEqual({ name: "git_merge", image });
		const same = make([{ body: [MERGE] }]);
		expect(await same.notifs.ensureEmoji({ name: "git_merge", image, replace: false })).toEqual({
			id: "900",
			created: false,
		});
	});

	it("shortens a long name so the temporary one is still a legal name", async () => {
		const long = "a".repeat(32);
		const { notifs, calls } = make([
			{ body: [{ id: "900", name: long }] },
			{ body: NEW },
			{ status: 204 },
			{ body: { id: "901", name: long } },
		]);
		await notifs.ensureEmoji({ name: long, image, replace: true });
		expect((calls[1]?.body as { name: string }).name).toBe(`${"a".repeat(28)}_new`);
	});

	it("stops, changing nothing, when a temporary emoji from an earlier run is there", async () => {
		const { notifs, calls } = make([{ body: [MERGE, NEW] }]);
		const err = (await notifs
			.ensureEmoji({ name: "git_merge", image, replace: true })
			.catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(/already has an emoji `:git_merge_new:`/);
		expect(err.message).toMatch(/`:git_merge:` was not touched/);
		expect(calls).toHaveLength(1);
	});

	it("leaves the old emoji and says Create Guild Expressions when the new one is refused", async () => {
		const { notifs, calls } = make([{ body: [MERGE] }, refused, bot]);
		const err = (await notifs
			.ensureEmoji({ name: "git_merge", image, replace: true })
			.catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(/lacks Create Guild Expressions, which replacing emoji `:git_merge:` needs/);
		expect(calls.some((c) => c.method === "DELETE")).toBe(false);
	});

	it("removes the new emoji again and asks for Manage Guild Expressions when the old one cannot be deleted", async () => {
		const { notifs, calls } = make([{ body: [MERGE] }, { body: NEW }, refused, { status: 204 }, bot]);
		const err = (await notifs
			.ensureEmoji({ name: "git_merge", image, replace: true })
			.catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(/lacks Manage Guild Expressions/);
		expect(err.message).toMatch(/nothing changed/);
		expect((inviteBits(err) & BigInt(permissions(["ManageGuildExpressions"]))) !== 0n).toBe(true);
		expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url.replace(BASE, ""))).toEqual([
			`/guilds/${GUILD}/emojis/900`,
			`/guilds/${GUILD}/emojis/901`,
		]);
	});

	it("passes another delete failure through, even when taking the new emoji back fails too", async () => {
		const { notifs } = make([
			{ body: [MERGE] },
			{ body: NEW },
			{ status: 500, body: { message: "boom" } },
			{ status: 500, body: { message: "boom" } },
		]);
		const err = await notifs.ensureEmoji({ name: "git_merge", image, replace: true }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).not.toMatch(/lacks/);
	});

	it("names the temporary emoji when the rename fails after the old one is gone", async () => {
		const { notifs } = make([
			{ body: [MERGE] },
			{ body: NEW },
			{ status: 204 },
			{ status: 500, body: { message: "boom" } },
		]);
		const err = (await notifs
			.ensureEmoji({ name: "git_merge", image, replace: true })
			.catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(/now `:git_merge_new:` \(id 901\)/);
		expect(err.message).toMatch(/rename it to `git_merge`/);
	});

	it("gives a forum's default reaction the new id when the channel step runs after the replace", async () => {
		const { notifs, calls } = make([
			{ body: [MERGE] },
			{ body: NEW },
			{ status: 204 },
			{ body: { id: "901", name: "git_merge" } },
			{ body: [forum(custom)] },
			{ body: [{ id: "901", name: "git_merge" }] },
			{ body: forum({ emoji_id: "901", emoji_name: null }) },
		]);
		await notifs.ensureEmoji({ name: "git_merge", image, replace: true });
		const result = await notifs.ensureChannel({ name: "prs", kind: "forum", defaultReaction: ":git_merge:" });
		expect(result.updated).toEqual(["default reaction"]);
		expect(calls[6]).toMatchObject({
			method: "PATCH",
			body: { default_reaction_emoji: { emoji_id: "901", emoji_name: null } },
		});
	});
});

describe("DiscordNotifications.checkEmoji", () => {
	const GREY: [number, number, number, number] = [120, 120, 120, 255];
	const GREEN: [number, number, number, number] = [40, 180, 70, 255];
	const wanted = dataUri(solidPng(16, GREEN));

	function withCdn(served: () => Promise<Uint8Array>, emojis: unknown[] = [MERGE]) {
		const { fetch, calls } = stubFetch([{ body: emojis }]);
		const botClient = createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch });
		const urls: string[] = [];
		const notifs = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE, fetch }),
			{ guildId: GUILD },
			() => WEBHOOK,
			() => botClient,
			undefined,
			async (url) => {
				urls.push(url);
				return served();
			}
		);
		return { notifs, calls, urls };
	}

	it("is missing when the server has no emoji of the name, and reads nothing from the CDN", async () => {
		const { notifs, urls } = withCdn(async () => solidPng(16, GREEN), []);
		expect(await notifs.checkEmoji({ name: "git_merge", image: wanted })).toEqual({ state: "missing" });
		expect(urls).toEqual([]);
	});

	it("is the same when the CDN copy shows the layout's picture", async () => {
		const { notifs, urls } = withCdn(async () => solidPng(16, [GREEN[0] + 3, GREEN[1], GREEN[2] - 3, 255]));
		expect(await notifs.checkEmoji({ name: "git_merge", image: wanted })).toEqual({ state: "same" });
		expect(urls).toEqual(["https://cdn.discordapp.com/emojis/900.png?size=128&quality=lossless"]);
	});

	it("is different when the CDN copy shows another picture", async () => {
		const { notifs } = withCdn(async () => solidPng(16, GREY));
		expect(await notifs.checkEmoji({ name: "git_merge", image: wanted })).toEqual({ state: "different" });
	});

	it("is unknown, never different, when the CDN copy cannot be read or decoded", async () => {
		const failing = withCdn(async () => {
			throw new Error("the CDN answered 404");
		});
		expect(await failing.notifs.checkEmoji({ name: "git_merge", image: wanted })).toEqual({
			state: "unknown",
			note: "the CDN answered 404",
		});
		const garbage = withCdn(async () => Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
		expect((await garbage.notifs.checkEmoji({ name: "git_merge", image: wanted })).state).toBe("unknown");
	});

	it("is unknown when the layout's image is not a PNG, and reads nothing from the CDN", async () => {
		const { notifs, urls } = withCdn(async () => solidPng(16, GREEN));
		const gif = await notifs.checkEmoji({ name: "git_merge", image: dataUri(Uint8Array.from([1]), "image/gif") });
		expect(gif).toEqual({ state: "unknown", note: "the layout's image is image/gif, not a PNG" });
		expect(urls).toEqual([]);
	});

	it("is unknown when the layout's image is not a data URI", async () => {
		const { notifs } = withCdn(async () => solidPng(16, GREEN));
		expect((await notifs.checkEmoji({ name: "git_merge", image: "nope" })).state).toBe("unknown");
	});

	it("a second run changes nothing: a matching emoji is not replaced, so no write is made", async () => {
		const { notifs, calls } = withCdn(async () => solidPng(16, GREEN), [MERGE]);
		const check = await notifs.checkEmoji({ name: "git_merge", image: wanted });
		expect(check.state).toBe("same");
		// What setup does next for a matching emoji: ensureEmoji without replace, which finds it and writes nothing.
		const stub = stubFetch([{ body: [MERGE] }]);
		const again = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE, fetch: stub.fetch }),
			{ guildId: GUILD },
			() => WEBHOOK,
			() => createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch: stub.fetch })
		);
		expect(await again.ensureEmoji({ name: "git_merge", image: wanted })).toEqual({ id: "900", created: false });
		expect(stub.calls.every((c) => c.method === "GET")).toBe(true);
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});
});

describe("the default CDN reader", () => {
	const GREEN: [number, number, number, number] = [40, 180, 70, 255];
	afterEach(() => vi.unstubAllGlobals());

	function onTheServer() {
		const { fetch } = stubFetch([{ body: [MERGE] }]);
		return new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE, fetch }),
			{ guildId: GUILD },
			() => WEBHOOK,
			() => createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch })
		);
	}
	const image = dataUri(solidPng(16, GREEN));

	it("fetches the CDN picture without credentials and compares it", async () => {
		const png = solidPng(16, GREEN);
		const cdn = vi.fn(async (..._args: unknown[]) => new Response(png));
		vi.stubGlobal("fetch", cdn);
		expect(await onTheServer().checkEmoji({ name: "git_merge", image })).toEqual({ state: "same" });
		expect(String(cdn.mock.calls[0]![0])).toBe(
			"https://cdn.discordapp.com/emojis/900.png?size=128&quality=lossless"
		);
		expect(cdn.mock.calls[0]![1]).not.toHaveProperty("headers");
	});

	it("is unknown when the CDN does not answer well, or answers with too much", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("no", { status: 404 }))
		);
		expect(await onTheServer().checkEmoji({ name: "git_merge", image })).toEqual({
			state: "unknown",
			note: "the CDN answered 404",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(new Uint8Array(1024 * 1024 + 1)))
		);
		expect((await onTheServer().checkEmoji({ name: "git_merge", image })).note).toMatch(/larger than 1 MiB/);
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
				layout: {
					categories: [
						{ name: "EMPTY" },
						{ name: "BUILD", channels: [{ name: "ideas", starterReactions: reactions }] },
					],
				},
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
