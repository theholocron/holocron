import type { DiscussionPatch, DiscussionPost, EnsuredDiscussion, EnsureDiscussionInput } from "@theholocron/cli";

import { ChannelType, type DiscordBotClient, type DiscordChannel, type DiscordThread, MessageFlag } from "../rest.js";

/** Discord's cap on the text of one message. */
const MAX_MESSAGE = 2000;

/**
 * The line that ends a post's first message and makes it findable and comparable: `-# sync: <key> | <state>`, where
 * `-#` is Discord's small print. `key` is the document's path; `state` is the state the post and the document last
 * agreed on, empty when none.
 */
const FOOTER = /^-# sync: (.+) \| (\S*)$/m;

/** One post found in a forum: the thread, and the text of its first message. */
interface Entry {
	thread: DiscordThread;
	/** The first message's text, which holds the footer. */
	content: string;
	/** The state the footer records. */
	synced: string | undefined;
}

/** What the discussion code needs from the provider around it. */
export interface DiscussionDeps {
	/** The bot client; throws when none is configured. */
	bot: () => DiscordBotClient;
	/** The server id. */
	guild: () => string;
	/** The server's channels, fetched once per run. */
	channels: () => Promise<DiscordChannel[]>;
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
				entries.set(footer[1]!, { thread, content: first.content, synced: footer[2] || undefined });
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
			...(state ? { state } : {}),
			...(entry.synced ? { synced: entry.synced } : {}),
		};
	}

	/** The first message for a post: the body, cut to fit, then the footer. */
	private static message(body: string, key: string, synced: string): string {
		const footer = `-# sync: ${key} | ${synced}`;
		const room = MAX_MESSAGE - footer.length - 2;
		const text = body.length > room ? `${body.slice(0, room - 1)}…` : body;
		return `${text}\n\n${footer}`;
	}

	/** Find the post for `key`, or make it in the state asked for. */
	async ensure(input: EnsureDiscussionInput): Promise<EnsuredDiscussion> {
		const forum = await this.forum(input.channel);
		const posts = await this.posts(forum);
		const existing = posts.get(input.key);
		if (existing) return { post: this.view(forum, existing), created: false };

		const tag = this.tagId(forum, input.state);
		const content = DiscordDiscussions.message(input.body, input.key, input.state);
		const made = await this.deps.bot().threads.createForumPost(forum.id, {
			name: input.title,
			applied_tags: [tag],
			message: { content, ...(input.quiet ? { flags: MessageFlag.SuppressNotifications } : {}) },
		});
		const entry: Entry = { thread: made, content, synced: input.state };
		posts.set(input.key, entry);
		return { post: this.view(forum, entry), created: true };
	}

	/** The post for `key`, or `undefined`. */
	async read(channel: string, key: string): Promise<DiscussionPost | undefined> {
		const forum = await this.forum(channel);
		const entry = (await this.posts(forum)).get(key);
		return entry ? this.view(forum, entry) : undefined;
	}

	/** Change the post for `key`: its title, its tag, the state it records as last synced. */
	async update(channel: string, key: string, patch: DiscussionPatch): Promise<void> {
		const forum = await this.forum(channel);
		const entry = (await this.posts(forum)).get(key);
		if (!entry) throw new Error(`no discussion post for \`${key}\` in \`${channel}\``);
		const bot = this.deps.bot();
		const thread = entry.thread;

		const change: Parameters<DiscordBotClient["threads"]["modify"]>[1] = {};
		if (patch.title !== undefined && patch.title !== thread.name) change.name = patch.title;
		if (patch.state !== undefined) change.applied_tags = [this.tagId(forum, patch.state)];
		const edited = patch.synced !== undefined && patch.synced !== entry.synced;
		// An archived post is written to by unarchiving it; Discord archives it again after a while.
		if ((Object.keys(change).length > 0 || edited) && thread.thread_metadata.archived) change.archived = false;
		if (Object.keys(change).length > 0) {
			entry.thread = { ...thread, ...(await bot.threads.modify(thread.id, change)) };
		}
		if (edited) {
			const content = entry.content.replace(FOOTER, `-# sync: ${key} | ${patch.synced}`);
			await bot.channels.editMessage(thread.id, thread.id, { content });
			entry.content = content;
			entry.synced = patch.synced || undefined;
		}
	}
}
