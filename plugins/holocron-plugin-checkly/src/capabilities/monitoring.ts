/**
 * `monitoring` capability for Checkly.
 *
 * `ensureCheck` is a find-or-create-or-update by name: Checkly's API has
 * no separate idempotency key, so a `search` list call (case-insensitive
 * partial match) narrows to candidates, then an exact-name match picks
 * the one to update. `checks` carries whatever this provider was
 * constructed with (from the provider config tuple's second argument —
 * same place `Deployment.domain` comes from) for `holocron repo setup`
 * to loop over generically.
 */

import {
	type Monitoring,
	type MonitoringAlertChannelInput,
	type MonitoringAlertChannelResult,
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

export interface ChecklyMonitoringOptions {
	checks?: MonitoringCheckInput[];
}

export class ChecklyMonitoring implements Monitoring {
	readonly key = "monitoring" as const;
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

	/**
	 * A Discord alert channel: a `WEBHOOK` Checkly formats for Discord. Found by name, so one made by hand is adopted and
	 * kept up to date, not duplicated. Every check on the account is subscribed, since a check made through the API is
	 * never subscribed on its own; subscriptions already there (including ones to checks outside Holocron) are kept.
	 * An existing channel keeps its own message template and send settings.
	 *
	 * Subscriptions go through Checkly's subscriptions call and are then read back: its create and update accept a
	 * `subscriptions` list but were seen not to apply it, so the count returned is what Checkly holds, and a check that
	 * could not be subscribed is an error and not a number.
	 */
	async ensureAlertChannel(input: MonitoringAlertChannelInput): Promise<MonitoringAlertChannelResult> {
		const client = this.client();
		const [channels, checkIds] = await Promise.all([client.alertChannels.list(), this.allCheckIds()]);
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
			});
			const { active } = await this.subscribeMissing(created.id, input.name, checkIds);
			return { created: true, updated: [], subscribed: active };
		}

		const urlChanged = input.url !== undefined && existing.config.url !== input.url;
		// Discord needs its own message shape: a channel left in another format would post nonsense there.
		const formatChanged = existing.config.webhookType !== "WEBHOOK_DISCORD";
		let current: AlertChannel | undefined;
		if (urlChanged || formatChanged) {
			// Read it again just before replacing it, so a subscription added since the listing is not replaced away.
			const fresh = await client.alertChannels.get(existing.id);
			const replacement: AlertChannelInput = {
				type: "WEBHOOK",
				config: {
					...existing.config,
					...(urlChanged ? { url: input.url! } : {}),
					...(formatChanged ? { webhookType: "WEBHOOK_DISCORD" as const, template: DISCORD_TEMPLATE } : {}),
				},
				sendRecovery: existing.sendRecovery,
				sendFailure: existing.sendFailure,
				sendDegraded: existing.sendDegraded,
				sslExpiry: existing.sslExpiry,
				sslExpiryThreshold: existing.sslExpiryThreshold,
				autoSubscribe: existing.autoSubscribe,
				// An update replaces the whole channel, so what it already has goes back. Sent without the ids, as Checkly's own
				// tooling sends them: with the ids Checkly answered 409 (a uniqueness violation).
				subscriptions: fresh.subscriptions.map((s) =>
					s.checkId
						? { checkId: s.checkId, activated: s.activated }
						: { groupId: s.groupId!, activated: s.activated }
				),
			};
			await client.alertChannels.update(existing.id, replacement);
			current = await this.restoreSubscriptions(existing.id, fresh.subscriptions);
		}
		const { added, active } = await this.subscribeMissing(existing.id, input.name, checkIds, current);
		const updated = [
			...(urlChanged ? ["url"] : []),
			...(formatChanged ? ["format"] : []),
			...(added > 0 ? ["subscriptions"] : []),
		];
		return { created: false, updated, subscribed: active };
	}

	/**
	 * After an update replaced the channel: read it back and put back any subscription it had that did not survive, of
	 * every kind (a group, a check outside this account) and in the state it had (a deactivated one stays deactivated).
	 */
	private async restoreSubscriptions(channelId: number, had: AlertChannel["subscriptions"]): Promise<AlertChannel> {
		const client = this.client();
		const after = await client.alertChannels.get(channelId);
		const held = (s: AlertChannel["subscriptions"][number]) =>
			after.subscriptions.some((a) => (s.checkId ? a.checkId === s.checkId : a.groupId === s.groupId));
		const lost = had.filter((s) => !held(s));
		for (const s of lost) await this.subscribeTolerating(channelId, s);
		return lost.length > 0 ? await client.alertChannels.get(channelId) : after;
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

	/** The id of every check on the account, read a page at a time. */
	private async allCheckIds(): Promise<string[]> {
		const PAGE = 100;
		const ids: string[] = [];
		for (let page = 1; ; page++) {
			const batch = await this.client().checks.list({ limit: PAGE, page });
			ids.push(...batch.map((c) => c.id));
			if (batch.length < PAGE) return ids;
		}
	}

	/** Checkly's `search` param is a case-insensitive partial match — narrow to the exact name ourselves. */
	private async findByExactName(name: string): Promise<ApiCheck | undefined> {
		const candidates = await this.client().checks.list({ search: name });
		return candidates.find((c) => c.name === name);
	}
}
