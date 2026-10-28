import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Errors, Monitoring, NotificationsLayout } from "../../plugin/index.js";
import { avatarProblem } from "./avatar-problem.js";
import type { DeployRelayInput } from "./relay.type.js";

/** Where the built relay Worker is, relative to the repo root, unless the layout says otherwise. */
export const DEFAULT_RELAY_CODE = "apps/comlink/dist/worker.js";
export const DEFAULT_RELAY_SCRIPT = "comlink";

type ErrorsFeed = boolean | { webhook?: string };

/** The webhook name a channel's error feed uses: its own, else the provider's name, capitalised (`Sentry`). */
export function errorsFeedWebhook(feed: ErrorsFeed, errors: Pick<Errors, "providerName">): string {
	const own = typeof feed === "object" ? feed.webhook : undefined;
	return own ?? capitalised(errors.providerName);
}

const capitalised = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** The Worker binding that holds the webhook URL for a source (the contract `apps/comlink` reads). */
export const relayWebhookBinding = (source: string): string => `COMLINK_${source.toUpperCase()}_WEBHOOK`;

/** The Worker binding that holds a source's signing secret (the contract `apps/comlink` reads). */
export const relaySecretBinding = (source: string): string => `COMLINK_${source.toUpperCase()}_SECRET`;

/** The names the tracker's side of the relay uses unless the layout says otherwise. */
export const DEFAULT_RELAY_INTEGRATION = "Comlink";
export const DEFAULT_RELAY_RULE = "Errors to Discord (Comlink)";

/** Whether any channel in the layout is fed by the error tracker. */
export function wantsRelay(layout: NotificationsLayout): boolean {
	return (layout.categories ?? []).some((c) => (c.channels ?? []).some((ch) => ch.feeds?.errors));
}

/**
 * The first reason the relay cannot be deployed, or undefined. One source has one webhook, so only one channel can be
 * fed by it; and the Worker needs somewhere to answer.
 */
export function relayProblem(
	layout: NotificationsLayout,
	errors?: Pick<Errors, "providerName">,
	monitoring?: Pick<Monitoring, "providerName">
): string | undefined {
	const fed = (layout.categories ?? []).flatMap((c) => c.channels ?? []).filter((ch) => ch.feeds?.errors);
	if (fed.length === 0) return undefined;
	if (!layout.relay?.host) {
		return `channel \`${fed[0]!.name}\` is fed by the error tracker, which needs \`relay.host\` — where the relay Worker answers`;
	}
	if (fed.length > 1) {
		return `channels ${fed.map((c) => `\`${c.name}\``).join(" and ")} are all fed by the error tracker, but its relay posts to one channel — feed one`;
	}
	const channel = fed[0]!;
	const errorsFeed = channel.feeds!.errors!;
	const picture = typeof errorsFeed === "object" ? errorsFeed.avatar : undefined;
	const pictureProblem = avatarProblem(channel.name, "errors", picture);
	if (pictureProblem) return pictureProblem;
	if (errors) {
		const feed = errorsFeedWebhook(errorsFeed, errors).toLowerCase();
		const own = (typeof channel.webhook === "object" ? channel.webhook.name : undefined) ?? channel.name;
		if (channel.webhook && feed === own.toLowerCase()) {
			return `channel \`${channel.name}\`: the relay webhook and the channel's own webhook are both named ${own} — rename one`;
		}
		// Discord matches names without regard to case, so equal names would be one webhook, and revoking one feed's URL would revoke both.
		const monitoringFeed = channel.feeds!.monitoring;
		if (monitoring && monitoringFeed) {
			const other =
				(typeof monitoringFeed === "object" ? monitoringFeed.webhook : undefined) ??
				capitalised(monitoring.providerName);
			if (feed === other.toLowerCase()) {
				return `channel \`${channel.name}\`: the relay webhook and the monitoring webhook are both named ${other} — rename one`;
			}
		}
	}
	return undefined;
}

/**
 * What to hand the `dns` capability as the zone: the layout's, else the host itself. The provider looks a name up from
 * the full name towards the apex until it finds a zone it holds, so this is right for any suffix (`example.co.uk`).
 */
export const relayZone = (relay: { host: string; zone?: string }): string => relay.zone ?? relay.host;

/**
 * Deploy the Worker with its webhook secret and its route, then point the host at it with a proxied placeholder record
 * (the Worker answers before any origin is asked). The built file is read first and the DNS record comes last, so a
 * missing build or a failed deploy leaves the host untouched.
 */
export async function deployRelay(input: DeployRelayInput): Promise<{ host: string; script: string }> {
	const { relay, workers, dns } = input;
	const path = join(input.repoRoot, relay.code ?? DEFAULT_RELAY_CODE);
	let code: string;
	try {
		code = await (input.readCode ?? ((p: string) => readFile(p, "utf8")))(path);
	} catch {
		throw new Error(
			`the relay Worker is not built (${relay.code ?? DEFAULT_RELAY_CODE}) — run \`pnpm --filter @theholocron/comlink run delivery.build\``
		);
	}
	const script = relay.script ?? DEFAULT_RELAY_SCRIPT;
	await workers.deployScript(script, {
		code,
		secrets: {
			[relayWebhookBinding(input.source)]: input.webhook,
			...(input.signingSecret ? { [relaySecretBinding(input.source)]: input.signingSecret } : {}),
		},
		routes: [`${relay.host}/*`],
	});
	await dns.upsertRecord(relayZone(relay), {
		type: "AAAA",
		name: relay.host,
		content: "100::",
		ttl: 1,
		proxied: true,
	});
	return { host: relay.host, script };
}
