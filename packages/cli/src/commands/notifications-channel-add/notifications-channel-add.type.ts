import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type {
	Monitoring,
	Notifications,
	NotificationsAccess,
	PluginLoader,
	RuntimeContext,
	Secrets,
	SecretScope,
} from "../../plugin/index.js";

export type NotificationsChannelAddPrint = (line: string) => void;

export interface RunNotificationsChannelAddInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Channel name. */
	name: string;
	/** Put the channel under this category (created if missing). */
	category?: string;
	topic?: string;
	/** Also create an inbound webhook for the channel and store its URL as a secret. */
	withWebhook?: boolean;
	/** Webhook display name. Defaults to the channel name. */
	webhookName?: string;
	/** Secret to store the URL in. Defaults to `HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>`. */
	secret?: string;
	/** Where the secret lives. Defaults to the org (`context.org`). */
	scope?: SecretScope;
	/** Which `notifications` provider, when several can provision. */
	provider?: string;
	loader?: PluginLoader;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
}

/** What happened to a channel's webhook. */
export interface WebhookOutcome {
	name: string;
	created: boolean;
	/** The secret the URL was stored in, when it was. */
	secret?: string;
	stored: boolean;
	/** Settings of the webhook that were set (`"avatar"`). */
	updated?: string[];
	/** Why nothing was stored, when nothing was. */
	note?: string;
}

export interface ChannelOutcome {
	name: string;
	category?: string;
	created: boolean;
	/** Settings of an existing channel that disagreed with the layout and were changed. */
	updated?: string[];
	webhook?: WebhookOutcome;
	/** The monitoring provider's alert channel for this channel, when it is fed by one. */
	alertChannel?: { name: string; created: boolean; updated: string[]; subscribed: number };
}

export interface NotificationsChannelAddReport {
	status: "ok" | "fail" | "dry-run";
	channel?: ChannelOutcome;
	message?: string;
}

/** What {@link provisionChannel} needs, already resolved. */
export interface ProvisionDeps {
	notifications: Notifications;
	/** Only needed for channels that ask for a webhook. */
	secrets?: Secrets;
	/** Only needed for channels fed by the monitoring provider. */
	monitoring?: Monitoring;
	scope: SecretScope;
	dryRun: boolean;
	print: NotificationsChannelAddPrint;
	/**
	 * Counted as each action happens, so a step that throws part-way still counts what it
	 * already did (a created channel whose webhook then failed is still a created channel).
	 */
	tally?: { ok: number; skip: number };
}

export interface ChannelSpec {
	name: string;
	category?: string;
	topic?: string;
	/** The access this channel should end up with (its own, over its category's). */
	access?: NotificationsAccess;
	/** `avatar` is the image itself, as a `data:` URI. */
	webhook?: false | { name?: string; secret?: string; avatar?: string };
	/** The monitoring provider's alerts, already resolved to the names to use. */
	feeds?: { monitoring?: { name: string; webhook: string; avatar?: string } };
}
