import { errorMessage } from "@theholocron/misc-utils";

import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { missingTokenReason } from "../missing-token/index.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { feedAvatarOf } from "../notifications-setup/index.js";
import {
	DEFAULT_RELAY_SCRIPT,
	errorsFeedWebhook,
	relaySecretBinding,
	relayWebhookBinding,
	wantsRelay,
} from "../notifications-setup/relay.js";
import type { RelayChecksInput } from "./relay-checks.type.js";

/** How long to wait for the Worker before calling it unreachable. */
export const RELAY_TIMEOUT_MS = 5000;

const ANSWERS_ID = "relay-answers";
const ANSWERS_TITLE = "relay Worker answers an unsigned request with 401";
const WORKER_ID = "relay-worker";
const WORKER_TITLE = "relay Worker is deployed and routed";
const BINDINGS_ID = "relay-bindings";
const BINDINGS_TITLE = "relay Worker has its webhook and signing secret bound";
const WEBHOOK_ID = "relay-feed-webhook";
const WEBHOOK_TITLE = "error feed webhook exists and has a picture";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (s: string) => sanitizeDetail(s);

/** One unsigned `POST` to the Worker, and what the answer says about it. Reads nothing from the response. */
async function answers(url: string, doFetch: typeof fetch): Promise<string[]> {
	try {
		const response = await doFetch(url, {
			method: "POST",
			redirect: "manual",
			signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
		});
		if (response.status === 401) return [];
		if (response.status === 404) return [`${shown(url)} answered 404: the Worker is not deployed or has no route`];
		return [`${shown(url)} answered ${response.status}, expected 401 for an unsigned request`];
	} catch (err) {
		const timedOut = err instanceof Error && err.name === "TimeoutError";
		return [
			timedOut
				? `${shown(url)} gave no answer within ${RELAY_TIMEOUT_MS / 1000}s`
				: `${shown(url)} could not be reached: ${shown(errorMessage(err))}`,
		];
	}
}

/**
 * The steps of `doctor notifications` that check the Comlink relay: the Worker answers an unsigned request with 401,
 * its script and route are deployed, its webhook and signing secret are bound (names only), and the feed webhook the
 * relay posts through exists. Read-only: the one request is unsigned, which the Worker rejects before reading it. No
 * rows when the layout declares no relay. The DNS record is `doctor dns`'s.
 */
export async function relayChecks(input: RelayChecksInput): Promise<NotificationsCheck[]> {
	const { layout } = input;
	const relay = layout.relay;
	if (!relay?.host || !wantsRelay(layout)) return [];
	if (!input.errors) {
		return [
			skipRow(ANSWERS_ID, ANSWERS_TITLE, input.errorsMissingReason),
			skipRow(WORKER_ID, WORKER_TITLE, input.errorsMissingReason),
			skipRow(BINDINGS_ID, BINDINGS_TITLE, input.errorsMissingReason),
			skipRow(WEBHOOK_ID, WEBHOOK_TITLE, input.errorsMissingReason),
		];
	}
	const source = input.errors.providerName;
	const rows: NotificationsCheck[] = [];

	// 1. the Worker answers
	rows.push(
		resultRow(
			ANSWERS_ID,
			ANSWERS_TITLE,
			await answers(`https://${relay.host}/${source}`, input.fetch ?? fetch),
			`https://${shown(relay.host)}/${shown(source)} answered 401`
		)
	);

	// 2 and 3. the script, its route and its bindings come from one read
	const script = relay.script ?? DEFAULT_RELAY_SCRIPT;
	const route = `${relay.host}/*`;
	const skipWorker = (reason: string) => [
		skipRow(WORKER_ID, WORKER_TITLE, reason),
		skipRow(BINDINGS_ID, BINDINGS_TITLE, reason),
	];
	if (!input.workers) {
		rows.push(...skipWorker(input.workersMissingReason));
	} else if (!input.workers.inspectScript) {
		rows.push(...skipWorker(`the \`${input.workers.providerName}\` provider cannot read its Workers`));
	} else {
		try {
			const state = await input.workers.inspectScript(script, relay.host);
			if (!state.exists) {
				rows.push(
					resultRow(WORKER_ID, WORKER_TITLE, [`no Worker named ${shown(script)}`], ""),
					skipRow(BINDINGS_ID, BINDINGS_TITLE, `not checked: no Worker named ${shown(script)}`)
				);
			} else {
				const bound = new Set(state.bindingNames.map((n) => n.toUpperCase()));
				const wanted = [relayWebhookBinding(source), relaySecretBinding(source)];
				rows.push(
					resultRow(
						WORKER_ID,
						WORKER_TITLE,
						state.routes.some((r) => same(r, route))
							? []
							: [`${shown(script)} has no route ${shown(route)}`],
						`${shown(script)} serves ${shown(route)}`
					),
					resultRow(
						BINDINGS_ID,
						BINDINGS_TITLE,
						wanted.filter((n) => !bound.has(n)).map((n) => `${n}: not bound`),
						`${wanted.length} of ${wanted.length} bound`
					)
				);
			}
		} catch (err) {
			const reason = missingTokenReason(err);
			rows.push(
				...(reason === undefined
					? [
							resultRow(WORKER_ID, WORKER_TITLE, [shown(describeProviderError(err))], ""),
							skipRow(BINDINGS_ID, BINDINGS_TITLE, "not checked: could not read the Worker"),
						]
					: skipWorker(reason))
			);
		}
	}

	// 4. the webhook the relay posts through
	rows.push(webhookRow(input, source));
	return rows;
}

/** The error feed's webhook is on its channel, with a picture when the layout or the provider gives one. */
function webhookRow(input: RelayChecksInput, source: string): NotificationsCheck {
	if (!input.found) return skipRow(WEBHOOK_ID, WEBHOOK_TITLE, "not checked: could not read the server");
	// `wantsRelay` found one, so the layout has categories.
	const channel = input.layout.categories!.flatMap((cat) => cat.channels ?? []).find((c) => c.feeds?.errors)!;
	const feed = channel.feeds!.errors as Exclude<NonNullable<NonNullable<typeof channel.feeds>["errors"]>, false>;
	const name = errorsFeedWebhook(feed, { providerName: source });
	const where = input.found.channels.find((c) => same(c.name, channel.name));
	const label = `#${shown(channel.name)}`;
	const problems: string[] = [];
	if (!where) {
		problems.push(`${label}: no channel to hold the feed webhook`);
	} else if (where.webhooksError) {
		problems.push(`${label}: could not list its webhooks (${shown(where.webhooksError)})`);
	} else if (!where.webhooks.some((w) => same(w, name))) {
		problems.push(`${label}: no webhook named ${shown(name)}`);
	} else if (feedAvatarOf(input.layout, feed).length > 0 && !where.webhookAvatars?.some((w) => same(w, name))) {
		problems.push(`${label}: webhook ${shown(name)} has no picture`);
	}
	return resultRow(WEBHOOK_ID, WEBHOOK_TITLE, problems, `${label}: ${shown(name)}`);
}
