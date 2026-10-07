import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createDiscordClient, parseWebhookUrl } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(webhookUrl: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	try {
		const { id, token } = parseWebhookUrl(webhookUrl);
		const client = createDiscordClient({ baseUrl: opts.baseUrl, fetch: opts.fetch });
		const info = await client.webhooks.get(id, token);
		return { ok: true, subject: `webhook: ${info.name} (id: ${info.id})` };
	} catch (err) {
		/* c8 ignore next */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
