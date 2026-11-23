/**
 * `holocron sync incidents` -- mirror a status page's incidents into a forum (spec `tech-incidents-to-discord`, #2366).
 *
 * The forum is the layout's channel with `feeds.incidents`, and the status page is the one that feed names (or the only
 * one declared). The run reads state, not events: every incident still open and those resolved since `--since`, from the
 * `monitoring` provider's `listIncidents`, and compares each with its post (found by key, with its messages) through
 * `planIncidentFeed()`. A missing post is made quietly, a new update is appended once (its marker is looked for first),
 * and the summary, the tag and whether the post is closed follow the incident. Nothing is ever deleted and an update
 * already posted is not rewritten. A rate limit (429) stops the run and the next one continues. It writes, so it asks
 * first; `--yes` skips the question and, without a terminal, a run with neither `--yes` nor `--dry-run` refuses.
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import {
	assertPluginsResolvable,
	type Monitoring,
	type MonitoringIncident,
	type MonitoringStatusPageInput,
	type Notifications,
	PluginLoader,
	ProviderApiError,
} from "../../../plugin/index.js";
import { incidentKey, postedUpdateIds } from "../../incident-markers/index.js";
import { notificationProviders } from "../../notifications-channel-add/index.js";
import { type IncidentFeedPlan, planIncidentFeed } from "../../plan-incident-feed/index.js";
import { renderIncident, renderIncidentUpdate } from "../../render-incident/index.js";
import { rateLimitedFor } from "../../specs-sync/rate-limit.js";
import { pickDiscussionProvider } from "../../specs-sync/specs-sync.js";
import { parseSince } from "../../sync-issues/parse-since/index.js";
import type { RunSyncIncidentsInput, SyncIncidentsCounts, SyncIncidentsReport } from "./run-sync-incidents.type.js";

const DEFAULT_SINCE = "2d";
/** How many of a post's messages are read to find the markers of its updates (Discord's limit per read). */
const MESSAGES = 100;

/** The channel carrying the feed, and the name of the status page it follows. */
function feedOf(
	notifications: Notifications,
	pages: readonly MonitoringStatusPageInput[]
): { channel: string; page: MonitoringStatusPageInput } | { problem: string } {
	const fed = (notifications.layout?.categories ?? [])
		.flatMap((c) => c.channels ?? [])
		.filter((c) => c.feeds?.incidents);
	if (fed.length === 0) return { problem: "no forum in the layout has `feeds.incidents`" };
	if (fed.length > 1) {
		return { problem: `several forums have \`feeds.incidents\` (${fed.map((c) => `\`${c.name}\``).join(", ")})` };
	}
	const channel = fed[0];
	const named = channel.feeds!.incidents;
	if (typeof named === "string") {
		const page = pages.find((p) => p.name === named);
		return page
			? { channel: channel.name, page }
			: {
					problem: `\`feeds.incidents\` names the status page "${named}", which the monitoring provider does not declare`,
				};
	}
	if (pages.length !== 1) {
		return {
			problem:
				pages.length === 0
					? "`feeds.incidents` is `true` but no status page is declared; name one"
					: `\`feeds.incidents\` is \`true\` but ${pages.length} status pages are declared; name one`,
		};
	}
	return { channel: channel.name, page: pages[0] };
}

export async function runSyncIncidents(input: RunSyncIncidentsInput): Promise<SyncIncidentsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const row = (status: "ok" | "skip" | "fail", ...parts: string[]) =>
		print(statusRow(status, ["sync incidents", ...parts]));
	const stop = (status: "fail" | "skip", reason: string): SyncIncidentsReport => {
		row(status, reason);
		return { status, reason };
	};
	const dryRun = Boolean(input.context.dryRun);

	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "sync incidents");

	let notifications: Notifications;
	try {
		notifications = pickDiscussionProvider(notificationProviders(loader), input.provider);
	} catch (err) {
		return stop("skip", errorMessage(err));
	}
	const monitoring: Monitoring | undefined = loader.has("monitoring") ? loader.get("monitoring") : undefined;
	if (!monitoring?.listIncidents) return stop("skip", "no `monitoring` provider that lists status page incidents");
	const feed = feedOf(notifications, monitoring.statusPages ?? []);
	if ("problem" in feed) return stop(feed.problem.startsWith("no forum") ? "skip" : "fail", feed.problem);
	const { channel, page } = feed;
	const statusPage = { name: page.name, ...(page.domain ? { url: `https://${page.domain}` } : {}) };

	let incidents: MonitoringIncident[];
	try {
		const since = input.since ?? parseSince(DEFAULT_SINCE, (input.now ?? new Date()).getTime());
		incidents = await monitoring.listIncidents({ statusPage: page.name, since });
	} catch (err) {
		// A plan that does not allow the read is not a failure of the run: there is nothing to mirror.
		const refused = err instanceof ProviderApiError && err.status === 403;
		return stop(refused ? "skip" : "fail", `reading incidents of "${page.name}": ${describeError(err)}`);
	}

	const counts: SyncIncidentsCounts = { created: 0, updated: 0, unchanged: 0, failed: 0, left: 0 };
	if (incidents.length === 0) {
		row("skip", `no incident of "${page.name}" is open or recent`);
		return { status: "ok", counts, plans: [] };
	}

	// Read each incident's post and decide, before anything is written.
	const work: { incident: MonitoringIncident; key: string; plan: IncidentFeedPlan }[] = [];
	const plans: IncidentFeedPlan[] = [];
	for (const incident of incidents) {
		const key = incidentKey(page.name, incident.id);
		const rendered = renderIncident(incident, statusPage);
		try {
			const post = await notifications.readDiscussion!(channel, key);
			const messages = post ? await notifications.readDiscussionMessages!(channel, key, MESSAGES) : [];
			const plan = planIncidentFeed({ incident, rendered, post, messages });
			plans.push(plan);
			if (plan.steps.length === 0) {
				counts.unchanged++;
				row("skip", incident.title, "in step");
			} else {
				work.push({ incident, key, plan });
			}
		} catch (err) {
			counts.failed++;
			row("fail", incident.title, `reading its post: ${describeError(err)}`);
		}
	}

	if (dryRun) {
		for (const { incident, plan } of work) row("skip", incident.title, `would ${plan.steps.join("; ")}`);
		row("skip", `dry run, nothing written; ${work.length} incident(s) would change, ${counts.unchanged} in step`);
		return { status: counts.failed > 0 ? "fail" : "ok", counts, plans };
	}

	if (work.length > 0 && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`sync incidents\` posts to #${channel}; pass --yes to run it without asking, or --dry-run to look`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Post ${work.length} incident(s) of "${page.name}" to #${channel}?`
		);
		if (!proceed) {
			row("skip", "cancelled; nothing was changed");
			return { status: "cancelled", counts, plans };
		}
	}

	for (const [index, { incident, key, plan }] of work.entries()) {
		try {
			await apply(notifications, channel, key, renderIncident(incident, statusPage), plan);
			if (plan.create) counts.created++;
			else counts.updated++;
			row("ok", incident.title, plan.steps.join("; "));
		} catch (err) {
			// A rate limit is not about this incident: stop, and the next run finds what this one made.
			if (rateLimitedFor(err) !== undefined) {
				counts.left = work.length - index;
				row(
					"skip",
					`stopped: the provider is rate limiting; ${counts.left} incident(s) are left for the next run`
				);
				break;
			}
			counts.failed++;
			row("fail", incident.title, describeError(err));
		}
	}

	row(
		counts.failed > 0 ? "fail" : "ok",
		`"${page.name}" to #${channel}: created ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged}, failed ${counts.failed}, left ${counts.left}`
	);
	return { status: counts.failed > 0 ? "fail" : "ok", counts, plans };
}

/** Writes one incident's plan: the post, then each update, then whether the post is closed. */
async function apply(
	notifications: Notifications,
	channel: string,
	key: string,
	rendered: ReturnType<typeof renderIncident>,
	plan: IncidentFeedPlan
): Promise<void> {
	let append = plan.append;
	if (plan.create) {
		const ensured = await notifications.ensureDiscussion!({
			channel,
			key,
			title: rendered.title,
			body: rendered.body,
			state: rendered.tag,
			quiet: true,
		});
		// A post made here may have raced another run's: keep the oldest, and post only what it lacks.
		if (ensured.created) {
			const removed = await notifications.dedupeDiscussion!(channel, key, { refresh: true });
			if (removed > 0) {
				const posted = postedUpdateIds(await notifications.readDiscussionMessages!(channel, key, MESSAGES));
				append = append.filter((u) => !posted.has(u.id));
			}
		} else {
			const posted = postedUpdateIds(await notifications.readDiscussionMessages!(channel, key, MESSAGES));
			append = append.filter((u) => !posted.has(u.id));
		}
	} else if (plan.rewrite || plan.retag || plan.close === false) {
		await notifications.updateDiscussion!(channel, key, {
			title: rendered.title,
			body: rendered.body,
			state: rendered.tag,
			...(plan.close === false ? { closed: false } : {}),
		});
	}
	for (const update of append) {
		await notifications.postDiscussionMessage!(channel, key, renderIncidentUpdate(update), { quiet: true });
	}
	// Last, so each message above is written to a post that can still be written to.
	if (plan.close === true) await notifications.updateDiscussion!(channel, key, { closed: true });
}
