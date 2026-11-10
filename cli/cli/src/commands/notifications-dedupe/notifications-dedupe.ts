/**
 * `holocron notifications dedupe` — delete the extra posts of a forum that has more than one post for the same key.
 *
 * Two deliveries that race (Sentinel's pull-request feed on serverless instances, #2032) can each make the post for one
 * pull request. This reads the forum afresh, lists every key with more than one post, and for each keeps the oldest
 * post and deletes the rest. It deletes threads, so it asks first unless `--dry-run` or `--yes` (without a terminal it
 * refuses instead). Idempotent: a second run finds nothing. A key that fails is reported and the run goes on.
 */

import { confirm } from "@inquirer/prompts";
import { NonInteractiveError, style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Notifications,
	type NotificationsLayout,
	PluginLoader,
} from "../../plugin/index.js";
import { notificationProviders, pickProvider } from "../notifications-channel-add/index.js";
import type { NotificationsDedupeReport, RunNotificationsDedupeInput } from "./notifications-dedupe.type.js";

/** The provider that can list the keys with more than one post and delete the extras. */
export function pickDeduper(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) => typeof p.duplicateDiscussions === "function" && typeof p.dedupeDiscussion === "function",
		{ infinitive: "de-duplicate forum posts", gerund: "de-duplicating forum posts" }
	);
}

/** The forum to repair when none is named: the layout's one forum with `feeds.prs`, or why there is not one. */
function defaultForum(layout: NotificationsLayout | undefined): { name: string } | { problem: string } {
	const fed = (layout?.categories ?? [])
		.flatMap((cat) => cat.channels ?? [])
		.filter((channel) => channel.feeds?.prs)
		.map((channel) => channel.name);
	if (fed.length === 1) return { name: fed[0]! };
	return {
		problem:
			fed.length === 0
				? "no forum in the layout has `feeds.prs`; name the forum to repair"
				: `several forums have \`feeds.prs\` (${fed.join(", ")}); name the forum to repair`,
	};
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function runNotificationsDedupe(input: RunNotificationsDedupeInput): Promise<NotificationsDedupeReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications dedupe");

	const dryRun = input.context.dryRun ?? false;
	const report: NotificationsDedupeReport = { status: "ok", duplicates: [], deleted: 0, failures: [] };
	const refuse = (message: string): NotificationsDedupeReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason: message }, "notifications dedupe");
		return { ...report, status: "fail", message };
	};

	let notifications: Notifications;
	try {
		notifications = pickDeduper(notificationProviders(loader), input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	let channel = input.channel;
	if (!channel) {
		const forum = defaultForum(notifications.layout);
		if ("problem" in forum) return refuse(forum.problem);
		channel = forum.name;
	}
	report.channel = channel;

	try {
		report.duplicates = await notifications.duplicateDiscussions!(channel);
	} catch (err) {
		return refuse(`could not read #${channel}: ${errorMessage(err)}`);
	}
	const extra = report.duplicates.reduce((sum, d) => sum + d.extra, 0);
	if (report.duplicates.length === 0) {
		print(`  ${style.success(`#${channel}: no key has more than one post`)}`);
		print("");
		print(style.header("1 ok, 0 fail, 0 skipped"));
		return report;
	}
	for (const { key, extra: n } of report.duplicates) {
		print(`  ${style.skip(`${key}: ${plural(n, "extra post")}`)}`);
	}

	if (dryRun) {
		print("");
		print(
			style.header(
				`0 ok, 0 fail, ${report.duplicates.length} skipped (would delete ${plural(extra, "post")} from #${channel})`
			)
		);
		return { ...report, status: "dry-run" };
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`notifications dedupe\` deletes ${plural(extra, "post")} from #${channel}; pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Delete ${plural(extra, "post")} from #${channel}, keeping the oldest post of each key?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was deleted")}`);
			return { ...report, status: "cancelled" };
		}
	}

	let ok = 0;
	for (const { key } of report.duplicates) {
		try {
			const deleted = await notifications.dedupeDiscussion!(channel, key);
			report.deleted += deleted;
			ok++;
			print(`  ${style.success(`${key}: deleted ${plural(deleted, "post")}`)}`);
		} catch (err) {
			const message = errorMessage(err);
			report.failures.push({ key, message });
			print(`  ${style.fail(`${key}: ${message}`)}`);
		}
	}

	if (report.failures.length > 0) report.status = "fail";
	print("");
	print(style.header(`${ok} ok, ${report.failures.length} fail, 0 skipped`));
	logger.info(
		{
			provider: notifications.providerName,
			channel,
			keys: report.duplicates.length,
			deleted: report.deleted,
			failures: report.failures.length,
			status: report.status,
		},
		"notifications dedupe"
	);
	return report;
}
