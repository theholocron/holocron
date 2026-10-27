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

/** A message Discord takes from a service: pings off, one or more embeds. */
export function message(username: string, embed: DiscordEmbed): DiscordMessage {
	return { username, allowed_mentions: { parse: [] }, embeds: [embed] };
}

/** Post a message to a channel's webhook. True when Discord took it. */
export async function postToDiscord(webhookUrl: string, body: DiscordMessage): Promise<boolean> {
	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.ok;
}
