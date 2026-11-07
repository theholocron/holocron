import type { DiscussionPatch, DiscussionPost, EnsuredDiscussion, EnsureDiscussionInput } from "@theholocron/cli";

import { ChannelType, type DiscordBotClient, type DiscordChannel, type DiscordThread, MessageFlag } from "../rest.js";

/** Discord's cap on the text of one message. */
const MAX_MESSAGE = 2000;

/**
 * The line that ends a post's first message and makes it findable and comparable: `-# sync: <key> | <state>`, where
 * `-#` is Discord's small print. `key` is the document's path; `state` is the state the post and the document last
 * agreed on, empty when none. A state is a tag's name, which may hold spaces (`changes requested`).
 */
const FOOTER = /^-# sync: (.+) \| (.*)$/m;

/** The paragraph of a first message that names the pull request, as `discussionBody` writes it. */
const PR_LINE = /^PR: \[#\d+\]\(<[^>]*>\)$/m;

/**
 * The first line of a first message, which names the document: its id (`SPEC-0007`), or the id as a link to the file
 * (`[SPEC-0007](<address>)`), as `discussionBody` writes it.
 */
const ID_LINE = /^(?:\[[A-Z]+-\d+\]\(<[^>\n]*>\)|[A-Z]+-\d+)$/;

/** One post found in a forum: the thread, and the text of its first message. */
interface Entry {
	/** The key the footer records: the path of the document the post was made for. */
	key: string;
	thread: DiscordThread;
	/** The first message's text, which holds the footer. */
	content: string;
	/** The state the footer records. */
	synced: string | undefined;
	/** Newer posts that carry the same key, which `dedupe` deletes. */
	duplicates: DiscordThread[];
}

/** What the discussion code needs from the provider around it. */
export interface DiscussionDeps {
	/** The bot client; throws when none is configured. */
	bot: () => DiscordBotClient;
	/** The server id. */
	guild: () => string;
	/** The server's channels, fetched once per run. */
	channels: () => Promise<DiscordChannel[]>;
	/** The reactions the layout wants on the first message of a new post in this forum; empty when none. */
	starterReactions?: (channel: string) => string[];
}

/**
 * Discussion posts for documents, in a Discord forum channel: one post per document, found again by the footer of its
 * first message, with the document's state shown as the post's one tag. The posts of a forum are read once per
 * instance, active and archived, and the copy is kept current by this instance's own writes.
 */
export class DiscordDiscussions {
	private readonly forums = new Map<string, Promise<Map<string, Entry>>>();

	constructor(private readonly deps: DiscussionDeps) {}

	/** The forum channel named `name`, or an error that says how to make it. */
	private async forum(name: string): Promise<DiscordChannel> {
		const found = (await this.deps.channels()).find(
			(c) => c.type === ChannelType.Forum && c.name.toLowerCase() === name.toLowerCase()
		);
		if (!found)
			throw new Error(
				`no forum named \`${name}\` -- declare it in the layout with \`kind: "forum"\` and run setup`
			);
		return found;
	}

	/** The id of the forum's tag named `state`, or an error that lists the tags it has. */
	private tagId(forum: DiscordChannel, state: string): string {
		const tags = forum.available_tags ?? [];
		const tag = tags.find((t) => t.name.toLowerCase() === state.toLowerCase());
		if (!tag) {
			throw new Error(
				`\`${forum.name}\` has no tag named \`${state}\` (it has ${tags.map((t) => `\`${t.name}\``).join(", ") || "none"}) -- add it to the layout and run setup`
			);
		}
		return tag.id;
	}

	/** The posts of a forum by key, read once: every thread's first message, for its footer. */
	private posts(forum: DiscordChannel): Promise<Map<string, Entry>> {
		let loaded = this.forums.get(forum.id);
		if (!loaded) {
			loaded = this.load(forum).catch((err: unknown) => {
				this.forums.delete(forum.id); // a failed read must not be remembered
				throw err;
			});
			this.forums.set(forum.id, loaded);
		}
		return loaded;
	}

	private async load(forum: DiscordChannel): Promise<Map<string, Entry>> {
		const bot = this.deps.bot();
		const entries = new Map<string, Entry>();
		for (const thread of await bot.threads.inChannel(this.deps.guild(), forum.id)) {
			// A post's first message has the post's id. A post whose opening message is gone has no footer to find it by.
			const first = await bot.channels.message(thread.id, thread.id).catch(() => undefined);
			const footer = first ? FOOTER.exec(first.content) : null;
			if (first && footer) {
				const entry: Entry = {
					key: footer[1]!,
					thread,
					content: first.content,
					synced: footer[2] || undefined,
					duplicates: [],
				};
				const held = entries.get(entry.key);
				if (!held) {
					entries.set(entry.key, entry);
				} else if (BigInt(thread.id) < BigInt(held.thread.id)) {
					// The oldest post (the smallest id) is the one kept.
					entry.duplicates = [held.thread, ...held.duplicates];
					entries.set(entry.key, entry);
				} else {
					held.duplicates.push(thread);
				}
			}
		}
		return entries;
	}

	/** A post as the caller sees it: its address, the one tag it carries as its state, and what it last synced. */
	private view(forum: DiscordChannel, entry: Entry): DiscussionPost {
		const names = (entry.thread.applied_tags ?? []).map(
			(id) => (forum.available_tags ?? []).find((t) => t.id === id)?.name
		);
		const state = names.length === 1 ? names[0] : undefined;
		return {
			url: `https://discord.com/channels/${this.deps.guild()}/${entry.thread.id}`,
			key: entry.key,
			title: entry.thread.name,
			...(state ? { state } : {}),
			...(entry.synced ? { synced: entry.synced } : {}),
			...(PR_LINE.test(entry.content) ? { prLine: PR_LINE.exec(entry.content)![0] } : {}),
			...(ID_LINE.test(entry.content.split("\n")[0]!) ? { idLine: entry.content.split("\n")[0]! } : {}),
			...(entry.thread.thread_metadata.locked ? { closed: true } : {}),
		};
	}

	/** The first message for a post: the body, cut to fit, then the footer. */
	private static message(body: string, key: string, synced: string): string {
		const footer = `-# sync: ${key} | ${synced}`;
		const room = MAX_MESSAGE - footer.length - 2;
		const text = body.length > room ? `${body.slice(0, room - 1)}…` : body;
		return `${text}\n\n${footer}`;
	}

	/**
	 * `content` with its pull request line set to `line`: replaced where it is, added after the other paragraphs when the
	 * message names none, taken out when `line` is empty. Every other paragraph and the footer stay as they were.
	 */
	private static withPrLine(content: string, line: string): string {
		const footer = FOOTER.exec(content)!;
		const body = content.slice(0, footer.index).trimEnd();
		const paragraphs = (body ? body.split("\n\n") : []).filter((p) => !PR_LINE.test(p));
		if (line) paragraphs.push(line);
		const next = [...paragraphs, footer[0]].join("\n\n");
		if (next.length > MAX_MESSAGE) {
			throw new Error(`the pull request line would take the first message past ${MAX_MESSAGE} characters`);
		}
		return next;
	}

	/**
	 * `content` with its first line, which names the document, set to `line`. Every other paragraph and the footer stay as
	 * they were. A message that does not start with an id is refused rather than guessed at.
	 */
	private static withIdLine(content: string, line: string): string {
		const first = content.split("\n")[0]!;
		if (!ID_LINE.test(first)) throw new Error("the first message does not start with the document's id");
		const next = `${line}${content.slice(first.length)}`;
		if (next.length > MAX_MESSAGE) {
			throw new Error(`the id line would take the first message past ${MAX_MESSAGE} characters`);
		}
		return next;
	}

	/**
	 * The post for `key`; failing that, the one a recorded address names, which is the document's post when its file has
	 * moved. Only a post of this forum is found, and a malformed or foreign address names none.
	 */
	private static find(posts: Map<string, Entry>, key: string, url: string | undefined): Entry | undefined {
		const direct = posts.get(key);
		if (direct) return direct;
		const thread = url ? /\/channels\/\d+\/(\d+)\/?$/.exec(url)?.[1] : undefined;
		return thread === undefined ? undefined : [...posts.values()].find((e) => e.thread.id === thread);
	}

	/** Find the post for `key`, or make it in the state asked for. */
	async ensure(input: EnsureDiscussionInput): Promise<EnsuredDiscussion> {
		const forum = await this.forum(input.channel);
		const posts = await this.posts(forum);
		const existing = DiscordDiscussions.find(posts, input.key, input.url);
		if (existing) {
			// Found by its address, not its key: the file moved, so the post follows it instead of being made again.
			const moved = existing.key !== input.key;
			if (moved) await this.update(input.channel, existing.key, { key: input.key });
			return { post: this.view(forum, existing), created: false, ...(moved ? { rekeyed: true } : {}) };
		}

		const tag = this.tagId(forum, input.state);
		const content = DiscordDiscussions.message(input.body, input.key, input.state);
		const made = await this.deps.bot().threads.createForumPost(forum.id, {
			name: input.title,
			applied_tags: [tag],
			message: { content, ...(input.quiet ? { flags: MessageFlag.SuppressNotifications } : {}) },
		});
		await this.react(made.id, input.channel);
		// A closed post is made open and closed straight after: a post cannot be made archived.
		const thread = input.closed
			? { ...made, ...(await this.deps.bot().threads.modify(made.id, { archived: true, locked: true })) }
			: made;
		const entry: Entry = { key: input.key, thread, content, synced: input.state, duplicates: [] };
		posts.set(input.key, entry);
		return { post: this.view(forum, entry), created: true };
	}

	/**
	 * Puts the layout's starter reactions on the first message of a post just made (its id is the post's). One that
	 * fails (the bot lacks Add Reactions, an emoji Discord does not know) is skipped: the post is already made, and a
	 * missing reaction must not fail the sync.
	 */
	private async react(post: string, channel: string): Promise<void> {
		for (const emoji of this.deps.starterReactions?.(channel) ?? []) {
			await this.deps
				.bot()
				.channels.addReaction(post, post, emoji)
				.catch(() => undefined);
		}
	}

	/** The post for `key` (or the one `url` names, when the file moved), or `undefined`. It writes nothing. */
	async read(channel: string, key: string, url?: string): Promise<DiscussionPost | undefined> {
		const forum = await this.forum(channel);
		const entry = DiscordDiscussions.find(await this.posts(forum), key, url);
		return entry ? this.view(forum, entry) : undefined;
	}

	/**
	 * Change the post for `key`: its key (the file moved), its title, its tag, whether it is closed, the state it
	 * records as last synced, the line that names the pull request, and the line that names the document (the id, plain or as a link). A closed post is archived and locked. To write to one it is unarchived first and closed again after, and one that is
	 * being reopened is unarchived and unlocked.
	 */
	async update(channel: string, key: string, patch: DiscussionPatch): Promise<void> {
		const forum = await this.forum(channel);
		const posts = await this.posts(forum);
		const entry = posts.get(key);
		if (!entry) throw new Error(`no discussion post for \`${key}\` in \`${channel}\``);
		const bot = this.deps.bot();
		const thread = entry.thread;
		const wasClosed = thread.thread_metadata.locked;
		const wantClosed = patch.closed ?? wasClosed;
		const reopening = wasClosed && !wantClosed;

		const change: Parameters<DiscordBotClient["threads"]["modify"]>[1] = {};
		if (patch.title !== undefined && patch.title !== thread.name) change.name = patch.title;
		if (patch.state !== undefined) change.applied_tags = [this.tagId(forum, patch.state)];
		const nextKey = patch.key ?? key;
		const footerEdited = nextKey !== key || (patch.synced !== undefined && patch.synced !== entry.synced);
		const base =
			patch.body === undefined ? entry.content : DiscordDiscussions.message(patch.body, key, entry.synced ?? "");
		const withPr = patch.prLine === undefined ? base : DiscordDiscussions.withPrLine(base, patch.prLine);
		const withId = patch.idLine === undefined ? withPr : DiscordDiscussions.withIdLine(withPr, patch.idLine);
		const edited = footerEdited || withId !== entry.content;
		// An archived post is written to by unarchiving it, and it is only unarchived for that: one Discord archived for
		// being quiet stays archived when there is nothing to write.
		if ((Object.keys(change).length > 0 || edited || reopening) && thread.thread_metadata.archived) {
			change.archived = false;
		}
		if (reopening) change.locked = false;
		if (Object.keys(change).length > 0) {
			entry.thread = { ...thread, ...(await bot.threads.modify(thread.id, change)) };
		}
		if (edited) {
			const synced = patch.synced ?? entry.synced ?? "";
			const content = withId.replace(FOOTER, () => `-# sync: ${nextKey} | ${synced}`);
			await bot.channels.editMessage(thread.id, thread.id, { content });
			entry.content = content;
			entry.synced = synced || undefined;
			if (nextKey !== key) {
				posts.delete(key);
				entry.key = nextKey;
				posts.set(nextKey, entry);
			}
		}
		// Closed last, so the writes above are not refused; again if they had to unarchive it.
		if (wantClosed && (!wasClosed || change.archived === false)) {
			entry.thread = {
				...entry.thread,
				...(await bot.threads.modify(thread.id, { archived: true, locked: true })),
			};
		}
	}

	/**
	 * Append a message to the post for `key`, mentioning no one. A post that is archived or locked is unarchived and
	 * unlocked for the write and put back as it was, also when the write fails.
	 */
	async post(channel: string, key: string, content: string, opts: { quiet?: boolean } = {}): Promise<void> {
		const entry = (await this.posts(await this.forum(channel))).get(key);
		if (!entry) throw new Error(`no discussion post for \`${key}\` in \`${channel}\``);
		const bot = this.deps.bot();
		const { archived, locked } = entry.thread.thread_metadata;
		const reopen = archived || locked;
		if (reopen) {
			entry.thread = {
				...entry.thread,
				...(await bot.threads.modify(entry.thread.id, { archived: false, locked: false })),
			};
		}
		try {
			const text = content.length > MAX_MESSAGE ? `${content.slice(0, MAX_MESSAGE - 1)}…` : content;
			await bot.channels.createMessage(entry.thread.id, {
				content: text,
				...(opts.quiet ? { flags: MessageFlag.SuppressNotifications } : {}),
			});
		} finally {
			if (reopen) {
				entry.thread = {
					...entry.thread,
					...(await bot.threads.modify(entry.thread.id, { archived, locked })),
				};
			}
		}
	}

	/** The text of the recent messages of the post for `key`, newest first; empty when there is no post. */
	async messages(channel: string, key: string, limit = 50): Promise<string[]> {
		const entry = (await this.posts(await this.forum(channel))).get(key);
		if (!entry) return [];
		const found = await this.deps.bot().channels.messages(entry.thread.id, Math.min(Math.max(limit, 1), 100));
		return found.map((m) => m.content);
	}

	/** Keep the oldest post that carries `key` and delete the others. Returns how many were deleted. */
	async dedupe(channel: string, key: string): Promise<number> {
		const entry = (await this.posts(await this.forum(channel))).get(key);
		if (!entry) return 0;
		const bot = this.deps.bot();
		let deleted = 0;
		while (entry.duplicates.length > 0) {
			await bot.threads.delete(entry.duplicates[0]!.id);
			entry.duplicates.shift(); // only once it is gone, so a failed run is retried
			deleted++;
		}
		return deleted;
	}
}
