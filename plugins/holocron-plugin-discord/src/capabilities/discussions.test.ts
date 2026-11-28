import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChannelType, createDiscordBotClient, type DiscordChannel, MessageFlag } from "../rest.js";
import { DiscordDiscussions, type DiscussionDeps } from "./discussions.js";

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

function make(
	responses: Parameters<typeof stubFetch>[0],
	channels: DiscordChannel[] = [FORUM],
	deps: Partial<DiscussionDeps> = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const bot = createDiscordBotClient({ botToken: "tok", baseUrl: BASE, fetch });
	const discussions = new DiscordDiscussions({
		bot: () => bot,
		guild: () => GUILD,
		channels: async () => channels,
		...deps,
	});
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
				key: INPUT.key,
				title: "SPEC: 5",
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
			key: INPUT.key,
			title: "SPEC: 6",
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
			key: INPUT.key,
			title: "SPEC: 5",
			state: "accepted",
			synced: "proposed",
		});
	});

	it("finds a post, and reads what it last synced, when the state is a tag name with a space", async () => {
		const pr = "theholocron/holocron#1";
		const spaced: DiscordChannel = {
			...FORUM,
			available_tags: [...(FORUM.available_tags ?? []), tag("904", "changes requested")],
		};
		const { discussions, calls } = make(
			[
				...listing([thread("5", { applied_tags: ["904"] })]),
				first("5", `About it.\n\n${footer(pr, "changes requested")}`),
			],
			[spaced]
		);

		const result = await discussions.ensure({ ...INPUT, key: pr, state: "changes requested" });

		expect(result.created).toBe(false);
		expect(result.post).toMatchObject({ key: pr, state: "changes requested", synced: "changes requested" });
		expect(calls.every((c) => c.method === "GET")).toBe(true);
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
		expect(found).toEqual({
			url: `https://discord.com/channels/${GUILD}/5`,
			key: INPUT.key,
			title: "SPEC: 5",
			state: "proposed",
		});
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

	it("renames a closed (archived and locked) post by unarchiving it, and closes it again", async () => {
		const closed = (over: object = {}) =>
			thread("5", {
				thread_metadata: { ...thread("5").thread_metadata, archived: true, locked: true },
				...over,
			});
		const { discussions, calls } = make([
			...listing([closed()]),
			first("5", `About A.\n\n${footer(INPUT.key, "proposed")}`),
			{ body: closed({ name: "Renamed", thread_metadata: { ...thread("5").thread_metadata, locked: true } }) },
			{ body: closed({ name: "Renamed" }) },
		]);

		await discussions.update("ideas", INPUT.key, { title: "Renamed" });

		expect(calls).toHaveLength(5);
		expect(calls[3]?.body).toEqual({ name: "Renamed", archived: false });
		expect(calls[4]?.body).toEqual({ archived: true, locked: true });
		expect(await discussions.read("ideas", INPUT.key)).toMatchObject({ title: "Renamed", closed: true });
	});

	it("does not rename a post whose title is already the one asked for", async () => {
		const { discussions, calls } = existing();

		await discussions.update("ideas", INPUT.key, { title: "SPEC: 5" });

		expect(calls).toHaveLength(3);
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

	describe("the pull request line", () => {
		const OLD = "PR: [#9](<https://github.com/o/r/pull/9>)";
		const NEW = "PR: [#10](<https://github.com/o/r/pull/10>)";
		const withContent = (content: string, over: Record<string, unknown> = {}) =>
			make([
				...listing([thread("5", over)]),
				first("5", content),
				{ body: thread("5", over) },
				{ body: { id: "5", channel_id: "5", content: "" } },
			]);
		const sent = (calls: { body?: unknown }[]) => (calls[3]?.body as { content: string }).content;

		it("shows the line a post names, and none when it names none", async () => {
			const named = withContent(`SPEC-1\n\nAbout A.\n\n${OLD}\n\n${footer(INPUT.key, "proposed")}`);
			const bare = withContent(`SPEC-1\n\n${footer(INPUT.key, "proposed")}`);

			expect((await named.discussions.read("ideas", INPUT.key))?.prLine).toBe(OLD);
			expect((await bare.discussions.read("ideas", INPUT.key))?.prLine).toBeUndefined();
		});

		it("replaces the line and keeps the rest of the first message, the synced line above all", async () => {
			const { discussions, calls } = withContent(
				`SPEC-1\n\nAbout A.\n\n${OLD}\n\n${footer(INPUT.key, "accepted")}`
			);

			await discussions.update("ideas", INPUT.key, { prLine: NEW });

			expect(calls).toHaveLength(4);
			expect(calls[3]).toMatchObject({ method: "PATCH", url: `${BASE}/channels/5/messages/5` });
			expect(sent(calls)).toBe(`SPEC-1\n\nAbout A.\n\n${NEW}\n\n${footer(INPUT.key, "accepted")}`);
			expect(await discussions.read("ideas", INPUT.key)).toMatchObject({ synced: "accepted", prLine: NEW });
		});

		it("adds the line when the message names none, even to a message that is only its footer", async () => {
			const some = withContent(`SPEC-1\n\nAbout A.\n\n${footer(INPUT.key, "proposed")}`);
			const empty = withContent(footer(INPUT.key, "proposed"));

			await some.discussions.update("ideas", INPUT.key, { prLine: NEW });
			await empty.discussions.update("ideas", INPUT.key, { prLine: NEW });

			expect(sent(some.calls)).toBe(`SPEC-1\n\nAbout A.\n\n${NEW}\n\n${footer(INPUT.key, "proposed")}`);
			expect(sent(empty.calls)).toBe(`${NEW}\n\n${footer(INPUT.key, "proposed")}`);
		});

		it("takes the line out when given an empty one", async () => {
			const { discussions, calls } = withContent(`SPEC-1\n\n${OLD}\n\n${footer(INPUT.key, "proposed")}`);

			await discussions.update("ideas", INPUT.key, { prLine: "" });

			expect(sent(calls)).toBe(`SPEC-1\n\n${footer(INPUT.key, "proposed")}`);
			expect((await discussions.read("ideas", INPUT.key))?.prLine).toBeUndefined();
		});

		it("edits nothing when the line is already the one asked for, or none is wanted", async () => {
			const same = withContent(`SPEC-1\n\n${OLD}\n\n${footer(INPUT.key, "proposed")}`);
			const none = withContent(`SPEC-1\n\n${footer(INPUT.key, "proposed")}`);

			await same.discussions.update("ideas", INPUT.key, { prLine: OLD });
			await none.discussions.update("ideas", INPUT.key, { prLine: "" });

			expect(same.calls).toHaveLength(3);
			expect(none.calls).toHaveLength(3);
		});

		it("does not touch the tag or title, and unarchives then re-closes a closed post to write", async () => {
			const closed = { thread_metadata: { ...thread("5").thread_metadata, archived: true, locked: true } };
			const { discussions, calls } = withContent(`SPEC-1\n\n${OLD}\n\n${footer(INPUT.key, "proposed")}`, closed);

			await discussions.update("ideas", INPUT.key, { prLine: NEW });

			expect(calls[3]?.body).toEqual({ archived: false });
			expect(calls[4]).toMatchObject({ url: `${BASE}/channels/5/messages/5` });
			expect(calls[5]?.body).toEqual({ archived: true, locked: true });
		});

		it("refuses a line that would take the message past Discord's limit", async () => {
			const { discussions } = withContent(`${"x".repeat(1950)}\n\n${footer(INPUT.key, "proposed")}`);

			await expect(discussions.update("ideas", INPUT.key, { prLine: NEW })).rejects.toThrow(
				/past 2000 characters/
			);
		});
	});

	describe("the id line", () => {
		const PLAIN = "SPEC-1";
		const LINKED = "[SPEC-1](<https://github.com/o/r/blob/alpha/docs/a.spec.md>)";
		const MOVED = "[SPEC-1](<https://github.com/o/r/blob/alpha/.notes/a.spec.md>)";
		const withContent = (content: string, over: Record<string, unknown> = {}) =>
			make([
				...listing([thread("5", over)]),
				first("5", content),
				{ body: thread("5", over) },
				{ body: { id: "5", channel_id: "5", content: "" } },
			]);
		const sent = (calls: { body?: unknown }[]) => (calls[3]?.body as { content: string }).content;

		it("shows the id as it stands, plain or linked, and none when the message does not start with one", async () => {
			const plain = withContent(`${PLAIN}\n\n${footer(INPUT.key, "proposed")}`);
			const linked = withContent(`${LINKED}\n\nAbout A.\n\n${footer(INPUT.key, "proposed")}`);
			const other = withContent(`About A.\n\n${footer(INPUT.key, "proposed")}`);

			expect((await plain.discussions.read("ideas", INPUT.key))?.idLine).toBe(PLAIN);
			expect((await linked.discussions.read("ideas", INPUT.key))?.idLine).toBe(LINKED);
			expect((await other.discussions.read("ideas", INPUT.key))?.idLine).toBeUndefined();
		});

		it("replaces only the first line and keeps the rest of the message, the synced line above all", async () => {
			const body = `About A.\n\nPR: [#9](<https://github.com/o/r/pull/9>)`;
			const { discussions, calls } = withContent(`${PLAIN}\n\n${body}\n\n${footer(INPUT.key, "accepted")}`);

			await discussions.update("ideas", INPUT.key, { idLine: LINKED });

			expect(calls).toHaveLength(4);
			expect(calls[3]).toMatchObject({ method: "PATCH", url: `${BASE}/channels/5/messages/5` });
			expect(sent(calls)).toBe(`${LINKED}\n\n${body}\n\n${footer(INPUT.key, "accepted")}`);
			expect(await discussions.read("ideas", INPUT.key)).toMatchObject({ synced: "accepted", idLine: LINKED });
		});

		it("rewrites a link to the file's new path, with the key, in one edit", async () => {
			const { discussions, calls } = withContent(`${MOVED}\n\n${footer(INPUT.key, "accepted")}`);

			await discussions.update("ideas", INPUT.key, { key: "docs/a.spec.md", idLine: LINKED });

			expect(sent(calls)).toBe(`${LINKED}\n\n${footer("docs/a.spec.md", "accepted")}`);
		});

		it("edits nothing when the line is already the one asked for", async () => {
			const { discussions, calls } = withContent(`${LINKED}\n\n${footer(INPUT.key, "proposed")}`);

			await discussions.update("ideas", INPUT.key, { idLine: LINKED });

			expect(calls).toHaveLength(3);
		});

		it("unarchives then re-closes a closed post to write", async () => {
			const closed = { thread_metadata: { ...thread("5").thread_metadata, archived: true, locked: true } };
			const { discussions, calls } = withContent(`${PLAIN}\n\n${footer(INPUT.key, "proposed")}`, closed);

			await discussions.update("ideas", INPUT.key, { idLine: LINKED });

			expect(calls[3]?.body).toEqual({ archived: false });
			expect(calls[4]).toMatchObject({ url: `${BASE}/channels/5/messages/5` });
			expect(calls[5]?.body).toEqual({ archived: true, locked: true });
		});

		it("refuses a message that does not start with an id, and a line past Discord's limit", async () => {
			const other = withContent(`About A.\n\n${footer(INPUT.key, "proposed")}`);
			const long = withContent(`${PLAIN}\n${"x".repeat(1950)}\n\n${footer(INPUT.key, "proposed")}`);

			await expect(other.discussions.update("ideas", INPUT.key, { idLine: LINKED })).rejects.toThrow(
				/does not start with the document's id/
			);
			await expect(
				long.discussions.update("ideas", INPUT.key, { idLine: `${LINKED}${"y".repeat(100)}` })
			).rejects.toThrow(/past 2000 characters/);
		});
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

describe("DiscordDiscussions — closed posts", () => {
	const meta = (over: object) => ({ ...thread("5").thread_metadata, ...over });
	const closedThread = (over: object = {}) =>
		thread("5", { thread_metadata: meta({ archived: true, locked: true }), ...over });
	const body = (id: string) => first(id, `About A.\n\n${footer(INPUT.key, "proposed")}`);

	it("closes a post it has just made, and says so when it is read", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }, { body: closedThread() }]);

		const result = await discussions.ensure({ ...INPUT, closed: true });

		expect(result.post.closed).toBe(true);
		expect(calls[3]).toMatchObject({
			method: "PATCH",
			url: `${BASE}/channels/5`,
			body: { archived: true, locked: true },
		});
	});

	it("does not close a post unless asked to", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }]);
		const result = await discussions.ensure(INPUT);
		expect(result.post).not.toHaveProperty("closed");
		expect(calls).toHaveLength(3);
	});

	it("reports a locked post as closed, and an open one, or one Discord only archived, as not", async () => {
		const locked = make([...listing([closedThread()]), body("5")]);
		const idle = make([...listing([thread("5", { thread_metadata: meta({ archived: true }) })]), body("5")]);

		expect((await locked.discussions.read("ideas", INPUT.key))?.closed).toBe(true);
		expect(await idle.discussions.read("ideas", INPUT.key)).not.toHaveProperty("closed");
	});

	it("closes an open post by archiving and locking it", async () => {
		const { discussions, calls } = make([...listing([thread("5")]), body("5"), { body: closedThread() }]);

		await discussions.update("ideas", INPUT.key, { closed: true });

		expect(calls).toHaveLength(4);
		expect(calls[3]?.body).toEqual({ archived: true, locked: true });
		expect((await discussions.read("ideas", INPUT.key))?.closed).toBe(true);
	});

	it("reopens a closed post by unarchiving and unlocking it, and a locked one that is not archived by unlocking it", async () => {
		const archived = make([...listing([closedThread()]), body("5"), { body: thread("5") }]);
		const lockedOnly = make([
			...listing([thread("5", { thread_metadata: meta({ locked: true }) })]),
			body("5"),
			{ body: thread("5") },
		]);

		await archived.discussions.update("ideas", INPUT.key, { closed: false });
		await lockedOnly.discussions.update("ideas", INPUT.key, { closed: false });

		expect(archived.calls[3]?.body).toEqual({ archived: false, locked: false });
		expect(lockedOnly.calls[3]?.body).toEqual({ locked: false });
		expect(archived.calls).toHaveLength(4);
	});

	it("writes to a closed post open, then closes it again", async () => {
		const { discussions, calls } = make([
			...listing([closedThread()]),
			body("5"),
			{ body: closedThread({ thread_metadata: meta({ archived: false, locked: true }), applied_tags: ["903"] }) },
			{ body: closedThread() },
		]);

		await discussions.update("ideas", INPUT.key, { state: "accepted" });

		expect(calls[3]?.body).toEqual({ applied_tags: ["903"], archived: false });
		expect(calls[4]?.body).toEqual({ archived: true, locked: true });
	});

	it("does nothing to a closed post it is told to close, or to an idle archived post it is told to open", async () => {
		const closed = make([...listing([closedThread()]), body("5")]);
		const idle = make([...listing([thread("5", { thread_metadata: meta({ archived: true }) })]), body("5")]);

		await closed.discussions.update("ideas", INPUT.key, { closed: true });
		await idle.discussions.update("ideas", INPUT.key, { closed: false });

		expect(closed.calls).toHaveLength(3);
		expect(idle.calls).toHaveLength(3);
	});
});

describe("DiscordDiscussions — a document whose file moved", () => {
	const OLD = ".notes/old.spec.md";
	const NEW = "docs/wiki/specifications/old.spec.md";
	const ADDRESS = `https://discord.com/channels/${GUILD}/5`;
	const existing = () => make([...listing([thread("5")]), first("5", `About A.\n\n${footer(OLD, "proposed")}`)]);

	it("finds the post by the address the file records and points it at the new path, instead of making a second post", async () => {
		const { discussions, calls } = make([
			...listing([thread("5")]),
			first("5", `About A.\n\n${footer(OLD, "proposed")}`),
			{ body: { id: "5", channel_id: "5", content: "" } },
		]);

		const result = await discussions.ensure({ ...INPUT, key: NEW, url: ADDRESS });

		expect(result).toMatchObject({ created: false, rekeyed: true, post: { url: ADDRESS, key: NEW } });
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
		expect(calls.at(-1)).toMatchObject({
			method: "PATCH",
			url: `${BASE}/channels/5/messages/5`,
			body: { content: `About A.\n\n${footer(NEW, "proposed")}` },
		});
		expect((await discussions.read("ideas", NEW))?.url).toBe(ADDRESS);
		expect(await discussions.read("ideas", OLD)).toBeUndefined();
	});

	it("uses the key when it finds one, whatever address the file records", async () => {
		const { discussions, calls } = make([
			...listing([thread("5")]),
			first("5", `About A.\n\n${footer(INPUT.key, "proposed")}`),
		]);

		const result = await discussions.ensure({ ...INPUT, url: "https://discord.com/channels/111/999" });

		expect(result).toEqual({ created: false, post: expect.objectContaining({ key: INPUT.key }) });
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("makes a post when the recorded address names no post of this forum, or is not an address", async () => {
		for (const url of ["https://discord.com/channels/111/999", "not an address", ""]) {
			const { discussions } = make([
				...listing([thread("5")]),
				first("5", `About A.\n\n${footer(OLD, "proposed")}`),
				{ body: thread("8") },
			]);

			expect((await discussions.ensure({ ...INPUT, key: NEW, url })).created).toBe(true);
		}
	});

	it("reads the post by the address without writing, and says which path it records", async () => {
		const { discussions, calls } = existing();

		const post = await discussions.read("ideas", NEW, ADDRESS);

		expect(post).toMatchObject({ url: ADDRESS, key: OLD });
		expect(calls.every((c) => c.method === "GET")).toBe(true);
		expect(await discussions.read("ideas", NEW)).toBeUndefined();
	});

	it("changes a post's key together with what it last synced, in one edit", async () => {
		const { discussions, calls } = make([
			...listing([thread("5")]),
			first("5", `About A.\n\n${footer(OLD, "draft")}`),
			{ body: { id: "5", channel_id: "5", content: "" } },
		]);

		await discussions.update("ideas", OLD, { key: NEW, synced: "accepted" });

		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
		expect(calls.at(-1)?.body).toMatchObject({ content: `About A.\n\n${footer(NEW, "accepted")}` });
		expect((await discussions.read("ideas", NEW))?.synced).toBe("accepted");
	});

	it("keeps an empty synced state empty when only the key changes", async () => {
		const { discussions, calls } = make([
			...listing([thread("5")]),
			first("5", `About A.\n\n${footer(OLD, "")}`),
			{ body: { id: "5", channel_id: "5", content: "" } },
		]);

		await discussions.update("ideas", OLD, { key: NEW });

		expect((calls.at(-1)?.body as { content: string }).content).toMatch(
			/-# sync: docs\/wiki\/specifications\/old\.spec\.md \| $/
		);
		expect((await discussions.read("ideas", NEW))?.synced).toBeUndefined();
	});
});

describe("DiscordDiscussions — link previews of a feed forum", () => {
	const KEY = "theholocron/holocron#123";
	const noPreviews = { suppressEmbeds: (channel: string) => channel === "ideas" };
	const message = (id: string, content: string) => ({ id, channel_id: "5", content });
	const body = first("5", `Title line\n\n${footer(KEY, "proposed")}`);

	it("hides them on the first message of a post it makes, with notifications still honoured", async () => {
		const { discussions, calls } = make([...listing([]), { body: thread("5") }], [FORUM], noPreviews);
		await discussions.ensure({ ...INPUT, quiet: true });
		expect(calls[2]?.body).toMatchObject({ message: { flags: MessageFlag.SuppressEmbeds | 4096 } });
	});

	it("hides them when it edits the first message, so an old post loses its previews", async () => {
		const { discussions, calls } = make(
			[...listing([thread("5")]), body, { body: message("5", "x") }],
			[FORUM],
			noPreviews
		);
		await discussions.update("ideas", KEY, { body: "New." });
		expect(calls[3]?.body).toMatchObject({ flags: MessageFlag.SuppressEmbeds });
	});

	it("hides them on a message it appends", async () => {
		const { discussions, calls } = make(
			[...listing([thread("5")]), body, { body: message("9", "hi") }],
			[FORUM],
			noPreviews
		);
		await discussions.post("ideas", KEY, "hi", { quiet: true });
		expect(calls[3]?.body).toMatchObject({ flags: MessageFlag.SuppressEmbeds | MessageFlag.SuppressNotifications });
	});

	it("leaves the previews alone in a forum that is not a feed", async () => {
		const { discussions, calls } = make([...listing([thread("5")]), body, { body: message("9", "hi") }]);
		await discussions.post("ideas", KEY, "hi");
		expect(calls[3]?.body).not.toHaveProperty("flags");
	});
});

describe("DiscordDiscussions — a pull request's post", () => {
	const KEY = "theholocron/holocron#123";
	const meta = (over: object) => ({ ...thread("5").thread_metadata, ...over });
	const body = (id: string, synced = "proposed") => first(id, `Title line\n\n${footer(KEY, synced)}`);
	const message = (id: string, content: string) => ({ id, channel_id: "5", content });
	const ok = { status: 204, body: undefined };

	it("finds the post by a pull request key in the archived posts, and reports its tag as the state", async () => {
		const { discussions } = make([
			...listing([], [thread("5", { thread_metadata: meta({ archived: true }) })]),
			body("5"),
		]);
		const post = await discussions.read("ideas", KEY);
		expect(post).toMatchObject({ key: KEY, state: "proposed", synced: "proposed" });
	});

	describe("update with a body", () => {
		it("replaces the first message's text and keeps the footer", async () => {
			const { discussions, calls } = make([...listing([thread("5")]), body("5"), { body: message("5", "x") }]);
			await discussions.update("ideas", KEY, { body: "New text." });
			expect(calls[3]).toMatchObject({
				method: "PATCH",
				url: `${BASE}/channels/5/messages/5`,
				body: { content: `New text.\n\n${footer(KEY, "proposed")}` },
			});
		});

		it("keeps an empty synced state empty", async () => {
			const { discussions, calls } = make([
				...listing([thread("5")]),
				first("5", `Old.\n\n${footer(KEY, "")}`),
				{ body: message("5", "x") },
			]);
			await discussions.update("ideas", KEY, { body: "New." });
			expect((calls[3]?.body as { content: string }).content).toBe(`New.\n\n${footer(KEY, "")}`);
		});

		it("writes nothing when the text is the one already there", async () => {
			const { discussions, calls } = make([...listing([thread("5")]), body("5")]);
			await discussions.update("ideas", KEY, { body: "Title line" });
			expect(calls).toHaveLength(3);
		});

		it("cuts a text that does not fit, follows a new key and state, and applies the pull request line to the new text", async () => {
			const { discussions, calls } = make([...listing([thread("5")]), body("5"), { body: message("5", "x") }]);
			await discussions.update("ideas", KEY, { body: "a".repeat(3000), key: "o/r#124", synced: "accepted" });
			const content = (calls[3]?.body as { content: string }).content;
			expect(content.length).toBeLessThanOrEqual(2000);
			expect(content).toContain("…\n\n-# sync: o/r#124 | accepted");

			const withPr = make([...listing([thread("5")]), body("5"), { body: message("5", "x") }]);
			await withPr.discussions.update("ideas", KEY, { body: "New.", prLine: "PR: [#9](<https://x.test/9>)" });
			expect((withPr.calls[3]?.body as { content: string }).content).toBe(
				`New.\n\nPR: [#9](<https://x.test/9>)\n\n${footer(KEY, "proposed")}`
			);
		});

		it("writes to a closed post open, then closes it again", async () => {
			const closed = thread("5", { thread_metadata: meta({ archived: true, locked: true }) });
			const { discussions, calls } = make([
				...listing([closed]),
				body("5"),
				{ body: thread("5", { thread_metadata: meta({ archived: false, locked: true }) }) },
				{ body: message("5", "x") },
				{ body: closed },
			]);
			await discussions.update("ideas", KEY, { body: "New." });
			expect(calls[3]?.body).toEqual({ archived: false });
			expect(calls[5]?.body).toEqual({ archived: true, locked: true });
		});
	});

	describe("post", () => {
		it("appends a message that pings no one, with no flags unless quiet", async () => {
			const { discussions, calls } = make([...listing([thread("5")]), body("5"), { body: message("9", "hi") }]);
			await discussions.post("ideas", KEY, "hi");
			expect(calls).toHaveLength(4);
			expect(calls[3]).toMatchObject({
				method: "POST",
				url: `${BASE}/channels/5/messages`,
				body: { content: "hi", allowed_mentions: { parse: [] } },
			});
			expect(calls[3]?.body).not.toHaveProperty("flags");
		});

		it("suppresses notifications when quiet, and cuts a message past the limit", async () => {
			const { discussions, calls } = make([...listing([thread("5")]), body("5"), { body: message("9", "hi") }]);
			await discussions.post("ideas", KEY, "b".repeat(2500), { quiet: true });
			const sent = calls[3]?.body as { content: string; flags: number };
			expect(sent.flags).toBe(MessageFlag.SuppressNotifications);
			expect(sent.content).toHaveLength(2000);
			expect(sent.content.endsWith("…")).toBe(true);
		});

		it("unarchives and unlocks a closed post, writes, and closes it again", async () => {
			const closed = thread("5", { thread_metadata: meta({ archived: true, locked: true }) });
			const { discussions, calls } = make([
				...listing([closed]),
				body("5"),
				{ body: thread("5") },
				{ body: message("9", "hi") },
				{ body: closed },
			]);
			await discussions.post("ideas", KEY, "hi");
			expect(calls[3]?.body).toEqual({ archived: false, locked: false });
			expect(calls[4]).toMatchObject({ url: `${BASE}/channels/5/messages` });
			expect(calls[5]?.body).toEqual({ archived: true, locked: true });
			expect((await discussions.read("ideas", KEY))?.closed).toBe(true);
		});

		it("puts an archived but unlocked post back archived only, even when the write fails", async () => {
			const idle = thread("5", { thread_metadata: meta({ archived: true }) });
			const { discussions, calls } = make([
				...listing([idle]),
				body("5"),
				{ body: thread("5") },
				{ status: 400, body: { message: "boom" } },
				{ body: idle },
			]);
			await expect(discussions.post("ideas", KEY, "hi")).rejects.toThrow();
			expect(calls[5]?.body).toEqual({ archived: true, locked: false });
		});

		it("throws when there is no post", async () => {
			const { discussions } = make(listing([]));
			await expect(discussions.post("ideas", KEY, "hi")).rejects.toThrow(/no discussion post/);
		});
	});

	describe("messages", () => {
		it("returns the text of the recent messages, newest first, from an archived post too", async () => {
			const { discussions, calls } = make([
				...listing([], [thread("5", { thread_metadata: meta({ archived: true }) })]),
				body("5"),
				{ body: [message("8", "marker"), message("5", "first")] },
			]);
			expect(await discussions.messages("ideas", KEY)).toEqual(["marker", "first"]);
			expect(calls[3]?.url).toBe(`${BASE}/channels/5/messages?limit=50`);
		});

		it("clamps the limit to what Discord allows, and is empty when there is no post", async () => {
			const high = make([...listing([thread("5")]), body("5"), { body: [] }]);
			await high.discussions.messages("ideas", KEY, 500);
			expect(high.calls[3]?.url).toBe(`${BASE}/channels/5/messages?limit=100`);
			const low = make([...listing([thread("5")]), body("5"), { body: [] }]);
			await low.discussions.messages("ideas", KEY, 0);
			expect(low.calls[3]?.url).toBe(`${BASE}/channels/5/messages?limit=1`);
			expect(await make(listing([])).discussions.messages("ideas", KEY)).toEqual([]);
		});
	});

	describe("dedupe", () => {
		it("keeps the oldest post and deletes the others, whichever order they are listed in", async () => {
			const { discussions, calls } = make([
				...listing([thread("7"), thread("5")], [thread("9")]),
				body("7"),
				body("5"),
				body("9"),
				ok,
				ok,
			]);
			expect(await discussions.dedupe("ideas", KEY)).toBe(2);
			expect(calls.slice(5).map((c) => [c.method, c.url])).toEqual([
				["DELETE", `${BASE}/channels/7`],
				["DELETE", `${BASE}/channels/9`],
			]);
			expect((await discussions.read("ideas", KEY))?.url).toMatch(/\/5$/);
			expect(await discussions.dedupe("ideas", KEY)).toBe(0);
		});

		it("keeps the oldest when it is listed first, and retries the rest after a failed delete", async () => {
			const { discussions } = make([
				...listing([thread("5"), thread("7")]),
				body("5"),
				body("7"),
				{ status: 403, body: { message: "no" } },
				ok,
			]);
			await expect(discussions.dedupe("ideas", KEY)).rejects.toThrow(/403/);
			expect(await discussions.dedupe("ideas", KEY)).toBe(1);
		});

		it("reads the forum again when asked, to find a post another instance made after the first read", async () => {
			const { discussions, calls } = make([
				...listing([thread("5")]),
				body("5"),
				...listing([thread("5"), thread("7")]),
				body("5"),
				body("7"),
				ok,
			]);
			expect((await discussions.read("ideas", KEY))?.url).toMatch(/\/5$/);
			expect(await discussions.dedupe("ideas", KEY)).toBe(0);
			expect(await discussions.dedupe("ideas", KEY, { refresh: true })).toBe(1);
			expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `${BASE}/channels/7` });
		});

		it("is 0 when there is one post or none", async () => {
			expect(await make([...listing([thread("5")]), body("5")]).discussions.dedupe("ideas", KEY)).toBe(0);
			expect(await make(listing([])).discussions.dedupe("ideas", KEY)).toBe(0);
		});
	});

	describe("duplicates", () => {
		it("lists each key that has more than one post, with the posts beyond the oldest, and deletes nothing", async () => {
			const other = "docs/wiki/specifications/other.spec.md";
			const { discussions, calls } = make([
				...listing([thread("7"), thread("5")], [thread("9"), thread("3")]),
				body("7"),
				body("5"),
				body("9"),
				first("3", `Title line\n\n${footer(other, "proposed")}`),
			]);
			expect(await discussions.duplicates("ideas")).toEqual([{ key: KEY, extra: 2 }]);
			expect(calls.some((c) => c.method === "DELETE")).toBe(false);
		});

		it("is empty when no key has more than one post", async () => {
			expect(await make([...listing([thread("5")]), body("5")]).discussions.duplicates("ideas")).toEqual([]);
		});

		it("reads the forum again, so a post made after the first read is counted, and dedupe then removes it", async () => {
			const { discussions } = make([
				...listing([thread("5")]),
				body("5"),
				...listing([thread("5"), thread("7")]),
				body("5"),
				body("7"),
				ok,
			]);
			expect((await discussions.read("ideas", KEY))?.url).toMatch(/\/5$/);
			expect(await discussions.duplicates("ideas")).toEqual([{ key: KEY, extra: 1 }]);
			expect(await discussions.dedupe("ideas", KEY)).toBe(1);
		});
	});
});
