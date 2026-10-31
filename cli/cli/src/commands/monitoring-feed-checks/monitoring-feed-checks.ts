import { MissingTokenError } from "../../plugin/index.js";
import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { feedAvatarOf, monitoringFeed } from "../notifications-setup/index.js";
import type { MonitoringFeedChecksInput } from "./monitoring-feed-checks.type.js";

const WEBHOOK_ID = "monitoring-feed-webhook";
const WEBHOOK_TITLE = "monitoring feed webhook exists and has a picture";
const CHANNEL_ID = "monitoring-alert-channel";
const CHANNEL_TITLE = "monitoring alert channel posts through the feed webhook";
const SUBSCRIPTIONS_ID = "monitoring-subscriptions";
const SUBSCRIPTIONS_TITLE = "monitoring alert channel is subscribed to every check";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (s: string) => sanitizeDetail(s);

const skip = (id: string, title: string, reason: string): NotificationsCheck => ({
	id,
	title,
	status: "skip",
	detail: reason,
	problems: [],
});
const row = (id: string, title: string, problems: string[], ok: string): NotificationsCheck => ({
	id,
	title,
	status: problems.length === 0 ? "pass" : "fail",
	detail: problems.length === 0 ? ok : `${problems.length} problem(s)`,
	problems,
});
const skipAll = (reason: string): NotificationsCheck[] => [
	skip(WEBHOOK_ID, WEBHOOK_TITLE, reason),
	skip(CHANNEL_ID, CHANNEL_TITLE, reason),
	skip(SUBSCRIPTIONS_ID, SUBSCRIPTIONS_TITLE, reason),
];

/**
 * The steps of `doctor notifications` that check the monitoring provider's feed into Discord: the webhook it posts
 * through, the alert channel that points at it, and the checks the alert channel is subscribed to. Read-only. No rows
 * when no channel has `feeds.monitoring`. Reads only the alert channel's non-secret parts: the webhook is told
 * apart by its id, and the URL it posts to is never read.
 */
export async function monitoringFeedChecks(input: MonitoringFeedChecksInput): Promise<NotificationsCheck[]> {
	const { layout, monitoring, found } = input;
	const fed = (layout.categories ?? [])
		.flatMap((cat) => cat.channels ?? [])
		.flatMap((channel) => (channel.feeds?.monitoring ? [{ channel, feed: channel.feeds.monitoring }] : []));
	if (fed.length === 0) return [];
	if (!monitoring) return skipAll(input.missingReason);
	if (!found) return skipAll("not checked: could not read the server");

	const webhookProblems: string[] = [];
	const channelProblems: string[] = [];
	const subscriptionProblems: string[] = [];
	let channelSkip: string | undefined;
	for (const { channel, feed } of fed) {
		const names = monitoringFeed(channel.name, feed, monitoring);
		const where = found.channels.find((c) => same(c.name, channel.name));
		const hookId = where?.webhookIds?.[names.webhook.toLowerCase()];
		const named = where?.webhooks.some((w) => same(w, names.webhook)) ?? false;
		const label = `#${shown(channel.name)}`;
		if (!where) {
			webhookProblems.push(`${label}: no channel to hold the feed webhook`);
		} else if (where.webhooksError) {
			webhookProblems.push(`${label}: could not list its webhooks (${shown(where.webhooksError)})`);
		} else if (!named) {
			webhookProblems.push(`${label}: no webhook named ${shown(names.webhook)}`);
		} else if (
			feedAvatarOf(layout, feed, monitoring).length > 0 &&
			!where.webhookAvatars?.some((w) => same(w, names.webhook))
		) {
			webhookProblems.push(`${label}: webhook ${shown(names.webhook)} has no picture`);
		}

		if (channelSkip !== undefined) continue;
		if (!monitoring.inspectAlertChannel) {
			channelSkip = `the \`${monitoring.providerName}\` provider cannot read its alert channels`;
			continue;
		}
		let state;
		try {
			state = await monitoring.inspectAlertChannel(names.name);
		} catch (err) {
			if (err instanceof MissingTokenError) {
				channelSkip = err.message;
				continue;
			}
			channelProblems.push(`${label}: ${shown(describeProviderError(err))}`);
			continue;
		}
		if (!state.exists) {
			channelProblems.push(`${label}: missing alert channel ${shown(names.name)}`);
			continue;
		}
		if (!state.discord) channelProblems.push(`${label}: ${shown(names.name)} is not formatted for Discord`);
		if (!state.webhookId) {
			channelProblems.push(`${label}: ${shown(names.name)} does not post to a Discord webhook URL`);
		} else if (hookId !== undefined && state.webhookId !== hookId) {
			channelProblems.push(
				`${label}: ${shown(names.name)} posts through a different webhook than ${shown(names.webhook)}`
			);
		}
		for (const check of state.unsubscribed) {
			subscriptionProblems.push(`${label}: ${shown(names.name)} is not subscribed to ${shown(check)}`);
		}
		for (const check of state.deactivated) {
			subscriptionProblems.push(`${label}: ${shown(names.name)} has ${shown(check)} switched off`);
		}
	}

	const n = fed.length;
	return [
		row(WEBHOOK_ID, WEBHOOK_TITLE, webhookProblems, `${n} of ${n} as declared`),
		...(channelSkip === undefined
			? [
					row(CHANNEL_ID, CHANNEL_TITLE, channelProblems, `${n} of ${n} as declared`),
					row(SUBSCRIPTIONS_ID, SUBSCRIPTIONS_TITLE, subscriptionProblems, `${n} of ${n} subscribed`),
				]
			: [skip(CHANNEL_ID, CHANNEL_TITLE, channelSkip), skip(SUBSCRIPTIONS_ID, SUBSCRIPTIONS_TITLE, channelSkip)]),
	];
}
