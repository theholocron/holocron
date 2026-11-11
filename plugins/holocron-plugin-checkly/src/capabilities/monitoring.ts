/**
 * `monitoring` capability for Checkly.
 *
 * `ensureCheck` is a find-or-create-or-update by name: Checkly's API has
 * no separate idempotency key, so a `search` list call (case-insensitive
 * partial match) narrows to candidates, then an exact-name match picks
 * the one to update. `checks` carries whatever this provider was
 * constructed with (from the provider config tuple's second argument —
 * same place `Deployment.domain` comes from) for `holocron setup`
 * to loop over generically.
 */

import {
	type Monitoring,
	type MonitoringAlertChannelInput,
	type MonitoringAlertChannelResult,
	type MonitoringAlertChannelState,
	type MonitoringAlertSettings,
	type MonitoringAssertion,
	type MonitoringCheck,
	type MonitoringCheckInput,
	ProviderApiError,
} from "@theholocron/cli";

import { CHECKLY_ICON } from "../icon.js";
import type {
	AlertChannel,
	AlertChannelInput,
	ApiCheck,
	ApiCheckInput,
	AssertionComparison,
	AssertionSource,
	ChecklyClient,
} from "../rest.js";
import { DISCORD_TEMPLATE } from "../rest.js";
import { routedAway as routedAwayFrom } from "../routing.js";
import { sameTemplate } from "../same-template.js";

const SOURCE_MAP: Record<string, AssertionSource> = {
	status_code: "STATUS_CODE",
	response_time: "RESPONSE_TIME",
	body: "TEXT_BODY",
	header: "HEADERS",
};

const COMPARISON_MAP: Record<string, AssertionComparison> = {
	equals: "EQUALS",
	not_equals: "NOT_EQUALS",
	contains: "CONTAINS",
	not_contains: "NOT_CONTAINS",
	greater_than: "GREATER_THAN",
	less_than: "LESS_THAN",
};

/** The id in a Discord webhook URL (`.../api/webhooks/<id>/<token>`): public, unlike the token after it. */
const DISCORD_WEBHOOK_ID = /\/api(?:\/v\d+)?\/webhooks\/(\d+)\//;

const SOURCE_FROM_CHECKLY = invert(SOURCE_MAP);
const COMPARISON_FROM_CHECKLY = invert(COMPARISON_MAP);

function invert<T extends string>(map: Record<string, T>): Record<string, string> {
	return Object.fromEntries(Object.entries(map).map(([ours, theirs]) => [theirs, ours]));
}

/** What a Checkly API check reads back as, in the shape `checks` declares. Settings Checkly does not return are left out. */
function fromChecklyCheck(check: ApiCheck): MonitoringCheckInput {
	const request = check.request;
	// An assertion on a source or comparison this interface has no word for (a JSON body, "has key") cannot be declared.
	const assertions = (request.assertions ?? []).flatMap((a) => {
		const source = SOURCE_FROM_CHECKLY[a.source];
		const comparison = COMPARISON_FROM_CHECKLY[a.comparison];
		if (!source || !comparison) return [];
		return [
			{
				source,
				comparison,
				...(a.property !== undefined ? { property: a.property } : {}),
				...(a.target !== undefined ? { target: a.target } : {}),
			} as MonitoringAssertion,
		];
	});
	return {
		name: check.name,
		url: request.url,
		method: request.method,
		frequency: check.frequency,
		activated: check.activated,
		shouldFail: check.shouldFail,
		assertions,
		...(check.locations ? { locations: check.locations } : {}),
		...(request.body ? { body: request.body } : {}),
	};
}

function toChecklyPayload(input: MonitoringCheckInput): ApiCheckInput {
	return {
		name: input.name,
		...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
		...(input.activated !== undefined ? { activated: input.activated } : {}),
		...(input.locations !== undefined ? { locations: input.locations } : {}),
		...(input.shouldFail !== undefined ? { shouldFail: input.shouldFail } : {}),
		request: {
			url: input.url,
			method: input.method ?? "GET",
			...(input.body !== undefined ? { body: input.body } : {}),
			assertions: (input.assertions ?? []).map((a) => ({
				source: SOURCE_MAP[a.source]!,
				comparison: COMPARISON_MAP[a.comparison]!,
				...(a.property !== undefined ? { property: a.property } : {}),
				...(a.target !== undefined ? { target: a.target } : {}),
			})),
		},
	};
}

/** The Checkly fields an alert channel's settings map to, for the settings the config states. */
function alertFields(
	alerts: MonitoringAlertSettings | undefined
): Pick<AlertChannelInput, "sendFailure" | "sendRecovery" | "sendDegraded" | "sslExpiry" | "sslExpiryThreshold"> {
	return {
		...(alerts?.failure !== undefined ? { sendFailure: alerts.failure } : {}),
		...(alerts?.recovery !== undefined ? { sendRecovery: alerts.recovery } : {}),
		...(alerts?.degraded !== undefined ? { sendDegraded: alerts.degraded } : {}),
		...(alerts?.sslExpiry !== undefined ? { sslExpiry: alerts.sslExpiry } : {}),
		...(alerts?.sslExpiryThreshold !== undefined ? { sslExpiryThreshold: alerts.sslExpiryThreshold } : {}),
	};
}

export interface ChecklyMonitoringOptions {
	checks?: MonitoringCheckInput[];
}

/** The Checkly implementation of the `monitoring` capability: ensures the configured API checks and alert channels exist. */
export class ChecklyMonitoring implements Monitoring {
	/** The capability this class provides, always `"monitoring"`. */
	readonly key = "monitoring" as const;
	/** The provider name, `"checkly"`. */
	readonly providerName = "checkly";
	readonly icon = CHECKLY_ICON;
	readonly checks: readonly MonitoringCheckInput[];

	constructor(
		private readonly client: () => ChecklyClient,
		opts: ChecklyMonitoringOptions = {}
	) {
		this.checks = opts.checks ?? [];
	}

	async whoami(): Promise<{ ok: boolean }> {
		try {
			await this.client().checks.list({ limit: 1 });
			return { ok: true };
		} catch {
			return { ok: false };
		}
	}

	async ensureCheck(input: MonitoringCheckInput): Promise<{ check: MonitoringCheck; alreadyExists: boolean }> {
		const existing = await this.findByExactName(input.name);
		const payload = toChecklyPayload(input);

		if (existing) {
			const updated = await this.client().checks.update(existing.id, payload);
			return { check: { id: updated.id, name: updated.name }, alreadyExists: true };
		}

		const created = await this.client().checks.create(payload);
		return { check: { id: created.id, name: created.name }, alreadyExists: false };
	}

	/** Every API check on the account, read a page at a time. Checks of another type (browser, heartbeat) are left out. */
	async listChecks(): Promise<MonitoringCheckInput[]> {
		const PAGE = 100;
		const found: MonitoringCheckInput[] = [];
		for (let page = 1; ; page++) {
			const batch = await this.client().checks.list({ limit: PAGE, page });
			found.push(...batch.filter((c) => c.checkType === "API").map(fromChecklyCheck));
			if (batch.length < PAGE) return found;
		}
	}

	/**
	 * A Discord alert channel: a `WEBHOOK` Checkly formats for Discord. Found by name, so one made by hand is adopted and
	 * kept up to date, not duplicated. Every check routed to the channel is subscribed (all of them, unless a configured
	 * check names its `alertChannels`; a check the config does not declare is not subject to routing), since a check
	 * made through the API is never subscribed on its own; subscriptions already there (including ones to checks outside
	 * Holocron, and ones to a check routed elsewhere) are kept, never removed. The alert settings the config states
	 * (`input.alerts`) are applied; an existing channel keeps every other send setting, and its message template only
	 * while it is the shipped one.
	 *
	 * Subscriptions go through Checkly's subscriptions call and are then read back: its create and update accept a
	 * `subscriptions` list but were seen not to apply it, so the count returned is what Checkly holds, and a check that
	 * could not be subscribed is an error and not a number.
	 */
	async ensureAlertChannel(input: MonitoringAlertChannelInput): Promise<MonitoringAlertChannelResult> {
		const client = this.client();
		const [channels, allChecks] = await Promise.all([client.alertChannels.list(), this.allChecks()]);
		const checkIds = this.routedTo(input.name, allChecks).routed.map((c) => c.id);
		const existing = channels.find(
			(c): c is Extract<AlertChannel, { type: "WEBHOOK" }> => c.type === "WEBHOOK" && c.config.name === input.name
		);

		if (!existing) {
			if (!input.url) {
				throw new Error(
					`cannot create alert channel "${input.name}": its webhook already exists and Discord shows a webhook URL only once, so delete that webhook and run setup again`
				);
			}
			const created = await client.alertChannels.create({
				type: "WEBHOOK",
				config: {
					name: input.name,
					url: input.url,
					method: "POST",
					headers: [],
					queryParameters: [],
					template: DISCORD_TEMPLATE,
					webhookType: "WEBHOOK_DISCORD",
				},
				sendFailure: true,
				sendRecovery: true,
				sendDegraded: true,
				autoSubscribe: false,
				...alertFields(input.alerts),
			});
			const { active } = await this.subscribeMissing(created.id, input.name, checkIds);
			return { created: true, updated: [], subscribed: active };
		}

		const urlChanged = input.url !== undefined && existing.config.url !== input.url;
		// Discord needs its own message shape: a channel left in another format would post nonsense there.
		const formatChanged = existing.config.webhookType !== "WEBHOOK_DISCORD";
		// The template is code like the rest of the channel: a hand edit is put back, so every run leaves the shipped one.
		const templateChanged = !formatChanged && !sameTemplate(existing.config.template, DISCORD_TEMPLATE);
		// Only the settings the config states are compared; one it leaves out stays as it is.
		const wanted = alertFields(input.alerts);
		const alertsChanged = (Object.keys(wanted) as (keyof typeof wanted)[]).some((k) => existing[k] !== wanted[k]);
		let current: AlertChannel | undefined;
		if (urlChanged || formatChanged || templateChanged || alertsChanged) {
			// Read it again just before replacing it, so a subscription added since the listing is not replaced away. Checkly's
			// update replaces the whole channel, so one added in the instant between this read and the update cannot be kept.
			// The settings that are not declared go back as this read has them, not as the listing had them.
			const fresh = await client.alertChannels.get(existing.id);
			const replacement: AlertChannelInput = {
				type: "WEBHOOK",
				config: {
					...existing.config,
					...(urlChanged ? { url: input.url! } : {}),
					...(formatChanged || templateChanged
						? { webhookType: "WEBHOOK_DISCORD" as const, template: DISCORD_TEMPLATE }
						: {}),
				},
				sendRecovery: fresh.sendRecovery,
				sendFailure: fresh.sendFailure,
				sendDegraded: fresh.sendDegraded,
				sslExpiry: fresh.sslExpiry,
				sslExpiryThreshold: fresh.sslExpiryThreshold,
				autoSubscribe: fresh.autoSubscribe,
				...wanted,
				// An update replaces the whole channel, so what it already has goes back. Sent without the ids, as Checkly's own
				// tooling sends them: with the ids Checkly answered 409 (a uniqueness violation).
				subscriptions: fresh.subscriptions.map((s) =>
					s.checkId
						? { checkId: s.checkId, activated: s.activated }
						: { groupId: s.groupId!, activated: s.activated }
				),
			};
			await client.alertChannels.update(existing.id, replacement);
			current = await this.restoreSubscriptions(existing.id, input.name, fresh.subscriptions);
		}
		const { added, active } = await this.subscribeMissing(existing.id, input.name, checkIds, current);
		const updated = [
			...(urlChanged ? ["url"] : []),
			...(formatChanged ? ["format"] : []),
			...(templateChanged ? ["template"] : []),
			...(alertsChanged ? ["alerts"] : []),
			...(added > 0 ? ["subscriptions"] : []),
		];
		return { created: false, updated, subscribed: active };
	}

	/**
	 * After an update replaced the channel: read it back and put back any subscription it had that did not survive, of
	 * every kind (a group, a check outside this account) and in the state it had (a deactivated one stays deactivated).
	 * Then read it once more: a subscription that could not be put back is an error, not a quiet loss.
	 */
	private async restoreSubscriptions(
		channelId: number,
		name: string,
		had: AlertChannel["subscriptions"]
	): Promise<AlertChannel> {
		const client = this.client();
		const held = (channel: AlertChannel, s: AlertChannel["subscriptions"][number]) =>
			channel.subscriptions.some((a) => (s.checkId ? a.checkId === s.checkId : a.groupId === s.groupId));
		const after = await client.alertChannels.get(channelId);
		const lost = had.filter((s) => !held(after, s));
		if (lost.length === 0) return after;
		const failures: unknown[] = [];
		for (const s of lost) {
			const failure = await this.subscribeTolerating(channelId, s);
			if (failure) failures.push(failure);
		}
		const restored = await client.alertChannels.get(channelId);
		const gone = lost.filter((s) => !held(restored, s));
		if (gone.length > 0) {
			const cause = failures[0] instanceof Error ? `: ${failures[0].message}` : "";
			throw new Error(
				`updating alert channel "${name}" dropped ${gone.length} of its subscriptions and Checkly would not take them back${cause}; subscribe them again in Checkly's alert settings`
			);
		}
		return restored;
	}

	/** One subscribe call; Checkly's 409 means the subscription is already there, which is what was wanted. */
	private async subscribeTolerating(
		channelId: number,
		subscription: AlertChannel["subscriptions"][number]
	): Promise<unknown> {
		try {
			await this.client().alertChannels.subscribe(
				channelId,
				subscription.checkId
					? { checkId: subscription.checkId, activated: subscription.activated }
					: { groupId: subscription.groupId!, activated: subscription.activated }
			);
			return undefined;
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 409) return undefined;
			return err;
		}
	}

	/**
	 * Subscribe the checks a channel lacks, then read it back. A subscription someone switched off is a choice: it is left
	 * off, not added a second time, and not counted. A call that fails does not stop the others: the channel is read back
	 * and the shortfall reported, with the first failure's reason. Returns how many were added and how many checks now alert.
	 */
	private async subscribeMissing(
		channelId: number,
		name: string,
		checkIds: string[],
		current?: AlertChannel
	): Promise<{ added: number; active: number }> {
		const client = this.client();
		const checkIdsOf = (channel: AlertChannel, onlyActive: boolean) =>
			new Set(
				channel.subscriptions.flatMap((s) => (s.checkId && (!onlyActive || s.activated) ? [s.checkId] : []))
			);
		const before = current ?? (await client.alertChannels.get(channelId));
		const known = checkIdsOf(before, false);
		const missing = checkIds.filter((id) => !known.has(id));
		const failures: unknown[] = [];
		for (const checkId of missing) {
			const failure = await this.subscribeTolerating(channelId, { checkId, activated: true });
			if (failure) failures.push(failure);
		}
		const after = missing.length > 0 ? await client.alertChannels.get(channelId) : before;
		const present = checkIdsOf(after, false);
		const active = checkIdsOf(after, true);
		// Everything must be on the channel, and what was just requested must also be switched on.
		const lacking = checkIds.filter((id) => !present.has(id) || (missing.includes(id) && !active.has(id)));
		if (lacking.length > 0) {
			const cause = failures[0] instanceof Error ? `: ${failures[0].message}` : "";
			throw new Error(
				`Checkly did not subscribe ${lacking.length} of ${checkIds.length} checks to alert channel "${name}" (it holds ${active.size})${cause}; subscribe them in Checkly's alert settings and run setup again`
			);
		}
		return { added: missing.length, active: active.size };
	}

	/**
	 * Read the alert channel named `name` and which of the account's checks it alerts for. Read-only. The URL it posts to
	 * is a credential, so only the webhook id inside it is returned, enough to tell which webhook it is.
	 */
	async inspectAlertChannel(name: string): Promise<MonitoringAlertChannelState> {
		const client = this.client();
		const [channels, allChecks] = await Promise.all([client.alertChannels.list(), this.allChecks()]);
		const { routed, routedAway: away } = this.routedTo(name, allChecks);
		const listed = channels.find(
			(c): c is Extract<AlertChannel, { type: "WEBHOOK" }> => c.type === "WEBHOOK" && c.config.name === name
		);
		if (!listed) return { exists: false, unsubscribed: [], misrouted: [], deactivated: [] };
		// The list may leave subscriptions out; the channel itself is the authority.
		const channel = await client.alertChannels.get(listed.id);
		const subscribed = new Map(channel.subscriptions.flatMap((s) => (s.checkId ? [[s.checkId, s.activated]] : [])));
		const groups = channel.subscriptions.filter((s) => s.groupId && s.activated).length;
		const webhookId = DISCORD_WEBHOOK_ID.exec(listed.config.url)?.[1];
		return {
			exists: true,
			discord: listed.config.webhookType === "WEBHOOK_DISCORD",
			...(webhookId ? { webhookId } : {}),
			alerts: {
				failure: channel.sendFailure,
				recovery: channel.sendRecovery,
				degraded: channel.sendDegraded,
				sslExpiry: channel.sslExpiry,
				sslExpiryThreshold: channel.sslExpiryThreshold,
			},
			unsubscribed: routed.filter((c) => !subscribed.has(c.id)).map((c) => c.name),
			misrouted: away.filter((c) => subscribed.has(c.id)).map((c) => c.name),
			// A group's subscription alerts for every check in it, routed away or not, and the client cannot read which checks
			// a group holds: when some check is routed away, say how many groups the channel alerts for.
			...(away.length > 0 && groups > 0 ? { groupSubscriptions: groups } : {}),
			deactivated: routed.filter((c) => subscribed.get(c.id) === false).map((c) => c.name),
		};
	}

	/**
	 * Which of the account's checks alert through the channel `name`: every one, except a declared check that names its
	 * `alertChannels` without it (see {@link routedAway}). A check the config does not declare is not subject to routing:
	 * it alerts through every channel, as one made by hand always has.
	 */
	private routedTo<T extends { name: string }>(name: string, checks: T[]): { routed: T[]; routedAway: T[] } {
		const away = (c: T) => routedAwayFrom(this.checks, c.name, name);
		return { routed: checks.filter((c) => !away(c)), routedAway: checks.filter(away) };
	}

	/** Every check on the account, read a page at a time. */
	private async allChecks(): Promise<{ id: string; name: string }[]> {
		const PAGE = 100;
		const found: { id: string; name: string }[] = [];
		for (let page = 1; ; page++) {
			const batch = await this.client().checks.list({ limit: PAGE, page });
			found.push(...batch.map((c) => ({ id: c.id, name: c.name })));
			if (batch.length < PAGE) return found;
		}
	}

	/** Checkly's `search` param is a case-insensitive partial match — narrow to the exact name ourselves. */
	private async findByExactName(name: string): Promise<ApiCheck | undefined> {
		const candidates = await this.client().checks.list({ search: name });
		return candidates.find((c) => c.name === name);
	}
}
