import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Dns, Errors, NotificationsLayout, Workers } from "../../plugin/index.js";

/** Where the built relay Worker is, relative to the repo root, unless the layout says otherwise. */
export const DEFAULT_RELAY_CODE = "apps/comlink/dist/worker.js";
export const DEFAULT_RELAY_SCRIPT = "comlink";

type ErrorsFeed = boolean | { webhook?: string };

/** The webhook name a channel's error feed uses: its own, else the provider's name, capitalised (`Sentry`). */
export function errorsFeedWebhook(feed: ErrorsFeed, errors: Pick<Errors, "providerName">): string {
	const own = typeof feed === "object" ? feed.webhook : undefined;
	const provider = errors.providerName;
	return own ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** The Worker binding that holds the webhook URL for a source (the contract `apps/comlink` reads). */
export const relayWebhookBinding = (source: string): string => `COMLINK_${source.toUpperCase()}_WEBHOOK`;

/** Whether any channel in the layout is fed by the error tracker. */
export function wantsRelay(layout: NotificationsLayout): boolean {
	return (layout.categories ?? []).some((c) => (c.channels ?? []).some((ch) => ch.feeds?.errors));
}

/**
 * The first reason the relay cannot be deployed, or undefined. One source has one webhook, so only one channel can be
 * fed by it; and the Worker needs somewhere to answer.
 */
export function relayProblem(layout: NotificationsLayout, errors?: Pick<Errors, "providerName">): string | undefined {
	const fed = (layout.categories ?? []).flatMap((c) => c.channels ?? []).filter((ch) => ch.feeds?.errors);
	if (fed.length === 0) return undefined;
	if (!layout.relay?.host) {
		return `channel \`${fed[0]!.name}\` is fed by the error tracker, which needs \`relay.host\` — where the relay Worker answers`;
	}
	if (fed.length > 1) {
		return `channels ${fed.map((c) => `\`${c.name}\``).join(" and ")} are all fed by the error tracker, but its relay posts to one channel — feed one`;
	}
	const channel = fed[0]!;
	if (errors && channel.webhook) {
		const own = (typeof channel.webhook === "object" ? channel.webhook.name : undefined) ?? channel.name;
		const feed = errorsFeedWebhook(channel.feeds!.errors!, errors);
		if (feed.toLowerCase() === own.toLowerCase()) {
			return `channel \`${channel.name}\`: the relay webhook and the channel's own webhook are both named ${own} — rename one`;
		}
	}
	return undefined;
}

/** The DNS zone of a host: the layout's, else the last two labels. */
export const relayZone = (relay: { host: string; zone?: string }): string =>
	relay.zone ?? relay.host.split(".").slice(-2).join(".");

export interface DeployRelayInput {
	relay: NonNullable<NotificationsLayout["relay"]>;
	/** The error tracker whose alerts it carries; names the binding. */
	source: string;
	/** The channel's relay webhook URL. A credential: it goes to the Worker and nowhere else. */
	webhook: string;
	repoRoot: string;
	workers: Workers;
	dns: Dns;
	/** Reads the built Worker. Defaults to the file system; tests pass their own. */
	readCode?: (path: string) => Promise<string>;
}

/**
 * Point the host at the Worker and deploy it: a proxied placeholder record (the Worker answers before any origin is
 * asked), then the script with its webhook secret and its route. The built file is read first, so a missing build
 * stops the run before the DNS record is touched.
 */
export async function deployRelay(input: DeployRelayInput): Promise<{ host: string; script: string }> {
	const { relay, workers, dns } = input;
	const path = join(input.repoRoot, relay.code ?? DEFAULT_RELAY_CODE);
	let code: string;
	try {
		code = await (input.readCode ?? ((p: string) => readFile(p, "utf8")))(path);
	} catch {
		throw new Error(
			`the relay Worker is not built (${relay.code ?? DEFAULT_RELAY_CODE}) — run \`pnpm --filter @theholocron/comlink build\``
		);
	}
	await dns.upsertRecord(relayZone(relay), {
		type: "AAAA",
		name: relay.host,
		content: "100::",
		ttl: 1,
		proxied: true,
	});
	const script = relay.script ?? DEFAULT_RELAY_SCRIPT;
	await workers.deployScript(script, {
		code,
		secrets: { [relayWebhookBinding(input.source)]: input.webhook },
		routes: [`${relay.host}/*`],
	});
	return { host: relay.host, script };
}
