import type { Notifications } from "@theholocron/cli";

import type { SlackClient } from "../rest.js";

export interface SlackNotificationsOptions {
	/** Default channel id used when `send()` is called without an explicit channel. */
	defaultChannel?: string;
}

export class SlackNotifications implements Notifications {
	readonly key = "notifications" as const;
	readonly providerName = "slack";

	constructor(
		private readonly client: SlackClient,
		private readonly opts: SlackNotificationsOptions
	) {}

	async send(channel: string, message: string): Promise<void> {
		const ch = channel || this.opts.defaultChannel;
		if (!ch) throw new Error("SlackNotifications.send: channel required (pass a channel id or set defaultChannel)");
		await this.client.chat.postMessage(ch, message);
	}
}
