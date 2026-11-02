import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChannelType, createDiscordBotClient, type DiscordChannel } from "../rest.js";
import { DiscordDiscussions } from "./discussions.js";

const BASE = "https://discord.test/api/v10";
const GUILD = "111";
const FORUM_ID = "2010";

const tag = (id: string, name: string) => ({ id, name, moderated: true, emoji_id: null, emoji_name: null });
const FORUM: DiscordChannel = {
	id: FORUM_ID,
	name: "ideas",
	type: ChannelType.Forum,
	available_tags: [tag("901", "draft"), tag("902", "proposed"), tag("903", "accepted")],
};

const thread = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	name: `SPEC: ${id}`,
	type: 11,
	parent_id: FORUM_ID,
	applied_tags: ["902"],
	thread_metadata: {
		archived: false,
		auto_archive_duration: 10080,
		archive_timestamp: `2026-10-0${id}T00:00:00.000Z`,
		locked: false,
	},
	...over,
});
const first = (id: string, content: string) => ({ body: { id, channel_id: id, content } });
const footer = (key: string, synced: string) => `-# sync: ${key} | ${synced}`;

/** The two reads that list a forum's posts: the server's active threads, then one page of archived ones. */
const listing = (active: unknown[], archived: unknown[] = []) => [
	{ body: { threads: active, members: [] } },
	{ body: { threads: archived, has_more: false } },
];

function make(responses: Parameters<typeof stubFetch>[0], channels: DiscordChannel[] = [FORUM]) {
	const { fetch, calls } = stubFetch(responses);
	const bot = createDiscordBotClient({ botToken: "tok", baseUrl: BASE, fetch });
	const discussions = new DiscordDiscussions({ bot: () => bot, guild: () => GUILD, channels: async () => channels });
	return { discussions, calls };
}

const INPUT = { channel: "ideas", key: ".notes/a.spec.md", title: "SPEC: A", body: "About A.", state: "proposed" };

describe("DiscordDiscussions.ensure", () => {
	it("makes a post, tagged with the state, whose first message ends with the footer", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }]);

		const result = await discussions.ensure(INPUT);

		expect(result).toEqual({
			created: true,
			post: {
				url: `https://discord.com/channels/${GUILD}/5`,
				state: "proposed",
				synced: "proposed",
			},
		});
		expect(calls[2]).toMatchObject({
			method: "POST",
			url: `${BASE}/channels/${FORUM_ID}/threads`,
			body: {
				name: "SPEC: A",
				applied_tags: ["902"],
				message: {
					content: `About A.\n\n${footer(INPUT.key, "proposed")}`,
					allowed_mentions: { parse: [] },
				},
			},
		});
		expect(calls[2]?.body).not.toHaveProperty("message.flags");
	});

	it("posts without notifying anyone when asked to", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }]);
		await discussions.ensure({ ...INPUT, quiet: true });
		expect(calls[2]?.body).toMatchObject({ message: { flags: 4096 } });
	});

	it("cuts a body that would not fit with its footer in one message", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }]);
		await discussions.ensure({ ...INPUT, body: "x".repeat(3000) });
		const content = (calls[2]?.body as { message: { content: string } }).message.content;
		expect(content).toHaveLength(2000);
		expect(content.endsWith(footer(INPUT.key, "proposed"))).toBe(true);
		expect(content).toContain("…\n\n-# sync:");
	});

	it("finds an existing post by its footer and changes nothing", async () => {
		const { discussions, calls } = make([
			...listing([thread("5"), thread("6")]),
			first("5", `Other.\n\n${footer(".notes/b.spec.md", "draft")}`),
			first("6", `About A.\n\n${footer(INPUT.key, "draft")}`),
		]);

		const result = await discussions.ensure(INPUT);

		expect(result.created).toBe(false);
		expect(result.post).toEqual({
			url: `https://discord.com/channels/${GUILD}/6`,
			state: "proposed",
			synced: "draft",
		});
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("finds a post that Discord archived", async () => {
		const { discussions } = make([
			...listing([], [thread("7")]),
			first("7", `About A.\n\n${footer(INPUT.key, "proposed")}`),
		]);
		expect((await discussions.ensure(INPUT)).created).toBe(false);
	});

	it("ignores a post whose opening message is gone, and one with no footer, and makes a new one", async () => {
		const { discussions, calls } = make([
			...listing([thread("5"), thread("6")]),
			{ status: 404, body: { message: "Unknown Message" } },
			first("6", "Someone's own post."),
			{ body: thread("8") },
		]);

		const result = await discussions.ensure(INPUT);

		expect(result.created).toBe(true);
		expect(calls.at(-1)?.method).toBe("POST");
	});

	it("reads the forum once, however many posts are asked for", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }, { body: thread("6") }]);

		await discussions.ensure(INPUT);
		await discussions.ensure({ ...INPUT, key: ".notes/b.spec.md", title: "SPEC: B" });
		await discussions.ensure(INPUT);

		expect(calls.filter((c) => c.url.includes("threads/active"))).toHaveLength(1);
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
	});

	it("does not remember a failed read of the forum", async () => {
		const { discussions } = make([
			{ status: 500, body: { message: "boom" } },
			...listing([]),
			{ body: thread("5") },
		]);

		await expect(discussions.ensure(INPUT)).rejects.toThrow(/500/);
		expect((await discussions.ensure(INPUT)).created).toBe(true);
	});

	it("says how to make a forum that is not there, and a tag the forum lacks", async () => {
		await expect(make([], []).discussions.ensure(INPUT)).rejects.toThrow(
			/no forum named `ideas` -- declare it in the layout with `kind: "forum"`/
		);
		await expect(make([...listing([])]).discussions.ensure({ ...INPUT, state: "rejected" })).rejects.toThrow(
			/`ideas` has no tag named `rejected` \(it has `draft`, `proposed`, `accepted`\)/
		);
		const bare: DiscordChannel = { id: FORUM_ID, name: "ideas", type: ChannelType.Forum };
		await expect(make([...listing([])], [bare]).discussions.ensure(INPUT)).rejects.toThrow(/\(it has none\)/);
	});

	it("takes the forum's name in any case, and does not take a text channel of that name", async () => {
		const text: DiscordChannel = { id: "5", name: "Ideas", type: ChannelType.Text };
		const upper: DiscordChannel = { ...FORUM, name: "Ideas" };

		expect((await make([...listing([]), { body: thread("5") }], [upper]).discussions.ensure(INPUT)).created).toBe(
			true
		);
		await expect(make([], [text]).discussions.ensure(INPUT)).rejects.toThrow(/no forum named/);
	});
});

describe("DiscordDiscussions.read", () => {
	const post = (applied: string[], synced = "proposed") =>
		make([
			...listing([thread("5", { applied_tags: applied })]),
			first("5", `About A.\n\n${footer(INPUT.key, synced)}`),
		]).discussions;

	it("gives the address, the one tag as the state, and what it last synced", async () => {
		expect(await post(["903"]).read("ideas", INPUT.key)).toEqual({
			url: `https://discord.com/channels/${GUILD}/5`,
			state: "accepted",
			synced: "proposed",
		});
	});

	it("has no state for a post with no tag, with two, or with a tag the forum no longer has", async () => {
		expect((await post([]).read("ideas", INPUT.key))?.state).toBeUndefined();
		expect((await post(["901", "902"]).read("ideas", INPUT.key))?.state).toBeUndefined();
		expect((await post(["999"]).read("ideas", INPUT.key))?.state).toBeUndefined();
	});

	it("has no state for a post Discord returns without a tag list, or in a forum that lists no tags", async () => {
		const untagged = make([
			...listing([{ ...thread("5"), applied_tags: undefined }]),
			first("5", `About A.\n\n${footer(INPUT.key, "proposed")}`),
		]);
		const bare: DiscordChannel = { id: FORUM_ID, name: "ideas", type: ChannelType.Forum };
		const noTags = make(
			[...listing([thread("5")]), first("5", `About A.\n\n${footer(INPUT.key, "proposed")}`)],
			[bare]
		);

		expect((await untagged.discussions.read("ideas", INPUT.key))?.state).toBeUndefined();
		expect((await noTags.discussions.read("ideas", INPUT.key))?.state).toBeUndefined();
	});

	it("has no synced state when the footer records none", async () => {
		const found = await post(["902"], "").read("ideas", INPUT.key);
		expect(found).toEqual({ url: `https://discord.com/channels/${GUILD}/5`, state: "proposed" });
	});

	it("is undefined for a document with no post", async () => {
		expect(await make([...listing([])]).discussions.read("ideas", INPUT.key)).toBeUndefined();
	});
});

describe("DiscordDiscussions.update", () => {
	const existing = (over: Record<string, unknown> = {}, synced = "proposed") =>
		make([
			...listing([thread("5", over)]),
			first("5", `About A.\n\n${footer(INPUT.key, synced)}`),
			{ body: thread("5", over) },
			{ body: { id: "5", channel_id: "5", content: "" } },
		]);

	it("retitles, retags and records the new synced state, and the read shows it", async () => {
		const { discussions, calls } = existing();

		await discussions.update("ideas", INPUT.key, { title: "SPEC: Renamed", state: "accepted", synced: "accepted" });

		expect(calls[3]).toMatchObject({
			method: "PATCH",
			url: `${BASE}/channels/5`,
			body: { name: "SPEC: Renamed", applied_tags: ["903"] },
		});
		expect(calls[4]).toMatchObject({
			method: "PATCH",
			url: `${BASE}/channels/5/messages/5`,
			body: { content: `About A.\n\n${footer(INPUT.key, "accepted")}`, allowed_mentions: { parse: [] } },
		});
		expect((await discussions.read("ideas", INPUT.key))?.synced).toBe("accepted");
	});

	it("changes only the tag, or only the synced line, when only that is asked", async () => {
		const tagOnly = existing();
		await tagOnly.discussions.update("ideas", INPUT.key, { state: "draft" });
		expect(tagOnly.calls).toHaveLength(4);
		expect(tagOnly.calls[3]?.body).toEqual({ applied_tags: ["901"] });

		const syncedOnly = make([
			...listing([thread("5")]),
			first("5", `About A.\n\n${footer(INPUT.key, "draft")}`),
			{ body: { id: "5", channel_id: "5", content: "" } },
		]);
		await syncedOnly.discussions.update("ideas", INPUT.key, { synced: "proposed" });
		expect(syncedOnly.calls).toHaveLength(4);
		expect(syncedOnly.calls[3]).toMatchObject({ url: `${BASE}/channels/5/messages/5` });
	});

	it("does nothing when nothing differs", async () => {
		const { discussions, calls } = make([
			...listing([thread("5", { name: "SPEC: A" })]),
			first("5", `About A.\n\n${footer(INPUT.key, "proposed")}`),
		]);

		await discussions.update("ideas", INPUT.key, { title: "SPEC: A", synced: "proposed" });
		await discussions.update("ideas", INPUT.key, {});

		expect(calls).toHaveLength(3);
	});

	it("clears the synced state when given an empty one", async () => {
		const { discussions } = existing();
		await discussions.update("ideas", INPUT.key, { synced: "" });
		expect((await discussions.read("ideas", INPUT.key))?.synced).toBeUndefined();
	});

	it("unarchives an archived post to write to it, for a tag and for a synced line", async () => {
		const archived = { thread_metadata: { ...thread("5").thread_metadata, archived: true } };
		const both = existing(archived);
		await both.discussions.update("ideas", INPUT.key, { state: "accepted", synced: "accepted" });
		expect(both.calls[3]?.body).toEqual({ applied_tags: ["903"], archived: false });

		const syncedOnly = existing(archived);
		await syncedOnly.discussions.update("ideas", INPUT.key, { synced: "draft" });
		expect(syncedOnly.calls[3]?.body).toEqual({ archived: false });
	});

	it("refuses a state the forum has no tag for, and a document with no post", async () => {
		await expect(existing().discussions.update("ideas", INPUT.key, { state: "rejected" })).rejects.toThrow(
			/has no tag named `rejected`/
		);
		await expect(make([...listing([])]).discussions.update("ideas", INPUT.key, {})).rejects.toThrow(
			/no discussion post for `\.notes\/a\.spec\.md` in `ideas`/
		);
	});
});
