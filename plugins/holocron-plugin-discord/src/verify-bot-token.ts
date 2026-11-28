import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createDiscordBotClient } from "./rest.js";

export interface VerifyBotTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
	/** Also send the bot token to `baseUrl`. Off by default, as for the plugin: a repo's config must not redirect it. */
	unsafeBotBaseUrl?: boolean;
}

/** Checks a Discord bot token by asking for the bot's own application; resolves to its name and id, or the failure message. */
export async function verifyBotToken(botToken: string, opts: VerifyBotTokenOptions = {}): Promise<VerifyTokenResult> {
	try {
		const client = createDiscordBotClient({
			botToken,
			...(opts.unsafeBotBaseUrl && opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
			...(opts.fetch ? { fetch: opts.fetch } : {}),
		});
		const app = await client.application.get();
		return { ok: true, subject: `bot: ${app.name} (id: ${app.id})` };
	} catch (err) {
		return { ok: false, message: errorMessage(err) };
	}
}
