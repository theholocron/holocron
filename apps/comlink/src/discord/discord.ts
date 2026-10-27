export interface DiscordEmbed {
	title?: string;
	description?: string;
	url?: string;
	color?: number;
	timestamp?: string;
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface DiscordMessage {
	username: string;
	/** Always empty: nothing a service says may ping anyone. */
	allowed_mentions: { parse: [] };
	embeds: DiscordEmbed[];
}

/** Text cut to a length Discord accepts, ending in an ellipsis when it was cut. */
export function clip(text: unknown, max: number): string {
	const s = String(text ?? "");
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Discord rejects an embed whose title, description and field names and values add up to more than this. */
const EMBED_TEXT_LIMIT = 6000;

/** The embed with its description cut so the whole fits Discord's combined limit; the description is the long part. */
function fit(embed: DiscordEmbed): DiscordEmbed {
	const others =
		(embed.title?.length ?? 0) + (embed.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
	const room = Math.max(0, EMBED_TEXT_LIMIT - others);
	if (!embed.description || embed.description.length <= room) return embed;
	const { description: _cut, ...rest } = embed;
	return room > 0 ? { ...rest, description: clip(embed.description, room) } : rest;
}

/** A message Discord takes from a service: pings off, one or more embeds. */
export function message(username: string, embed: DiscordEmbed): DiscordMessage {
	return { username, allowed_mentions: { parse: [] }, embeds: [fit(embed)] };
}

/** How long Discord has to answer before the post counts as failed. */
const POST_TIMEOUT_MS = 8000;

/** Post a message to a channel's webhook. True when Discord took it; false when it refused, failed or timed out. */
export async function postToDiscord(webhookUrl: string, body: DiscordMessage): Promise<boolean> {
	try {
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(POST_TIMEOUT_MS),
		});
		return res.ok;
	} catch {
		return false;
	}
}
