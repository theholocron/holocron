import type { Notifications } from "@theholocron/cli";

import type { SlackClient } from "../rest.js";

/** Options for the Slack `notifications` capability. */
export interface SlackNotificationsOptions {
	/** Default channel id used when `send()` is called without an explicit channel. */
	defaultChannel?: string;
}

/** `notifications` capability for Slack: posts messages to a channel as the bot. */
export class SlackNotifications implements Notifications {
	/** Capability key; always `"notifications"`. */
	readonly key = "notifications" as const;
	/** Provider name; always `"slack"`. */
	readonly providerName = "slack";

	constructor(
		/** Memoized client thunk — resolves the token on first authenticated call. */
		private readonly client: () => SlackClient,
		private readonly opts: SlackNotificationsOptions
	) {}

	async send(channel: string, message: string): Promise<void> {
		const ch = channel || this.opts.defaultChannel;
		if (!ch) throw new Error("SlackNotifications.send: channel required (pass a channel id or set defaultChannel)");
		await this.client().chat.postMessage(ch, message);
	}
}
