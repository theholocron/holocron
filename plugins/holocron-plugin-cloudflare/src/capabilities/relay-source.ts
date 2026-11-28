import type {
	EnsureRelaySourceInput,
	EnsureRelaySourceResult,
	InspectRelaySourceInput,
	RelaySourceState,
} from "@theholocron/cli";
import type { CfNotificationPolicy, CfNotificationPolicyInput } from "@theholocron/cloudflare-client";

import type { CloudflareClient } from "../rest.js";
import { destinationMatches } from "./destination-matches.js";
import { newestDestination } from "./newest-destination.js";

/** The name of the policy that sends one alert type to the relay: the source's name, then the alert type. */
export function policyName(name: string, alertType: string): string {
	return `${name}: ${alertType}`;
}

/**
 * The webhook targets of a policy with the destination in them, once, and without the other destinations that match
 * the same source (`duplicates`): a policy that still names an older duplicate would send every alert twice.
 */
function withDestination(
	webhooks: Array<{ id: string }> = [],
	id: string,
	duplicates: ReadonlySet<string>
): Array<{ id: string }> {
	const kept = webhooks.filter((w) => w.id === id || !duplicates.has(w.id));
	return kept.some((w) => w.id === id) ? kept : [...kept, { id }];
}

/** The policies that belong to a source, found by name (ignoring case, as the destination is), one per alert type of its layout. */
function ownPolicies(policies: CfNotificationPolicy[], name: string): CfNotificationPolicy[] {
	const prefix = `${name}: `.toLowerCase();
	return policies.filter((p) => p.name.toLowerCase().startsWith(prefix));
}

/**
 * Makes the Cloudflare notification webhook for a relay source (spec `tech-relay-sources`). A destination alone sends
 * nothing, so each alert type of `events` gets a policy of its own that names the destination. The destination is
 * found by name and (masked) URL and each policy by name; nothing is deleted. The secret the caller offers is set only when the
 * destination is made (Cloudflare never returns it), so it is returned only then.
 */
export async function ensureRelaySource(
	client: CloudflareClient,
	accountId: string,
	input: EnsureRelaySourceInput
): Promise<EnsureRelaySourceResult> {
	const updated: string[] = [];
	const destinations = await client.alerting.webhooks.list(accountId);
	const matches = destinations.filter((d) => destinationMatches(d, input));
	let found = newestDestination(matches);
	let created = false;
	let secret: string | undefined;
	if (!found) {
		const made = await client.alerting.webhooks.create(accountId, {
			name: input.name,
			url: input.url,
			...(input.secret ? { secret: input.secret } : {}),
		});
		found = { id: made.id, name: input.name, url: input.url };
		created = true;
		if (input.secret) secret = input.secret;
	}
	const destination = found;
	const duplicates = new Set(matches.map((d) => d.id));

	const todo: string[] = [];
	if (matches.length > 1) {
		const others = matches.filter((d) => d.id !== destination.id).map((d) => d.id);
		todo.push(
			`Cloudflare has ${matches.length} destinations named ${input.name} for ${input.url} (${matches.map((d) => d.id).join(", ")}). Setup attaches the policies to the newest (${destination.id}) and takes the others off them. Cloudflare does not show a destination's secret, so which one the Worker's secret belongs to is not checked. Send a test alert to confirm it is accepted, then delete the unused ones (${others.join(", ")}) in the Cloudflare dashboard (Notifications, Destinations).`
		);
	}
	const events = input.events ?? [];
	if (events.length === 0) {
		todo.push(
			`List the Cloudflare alert types to send in the source's \`events\` (GET /accounts/<id>/alerting/v3/available_alerts names them); a webhook with no policy sends nothing.`
		);
		return { created, updated, ...(secret ? { secret } : {}), todo };
	}

	const policies = ownPolicies(await client.alerting.policies.list(accountId), input.name);
	for (const alertType of events) {
		const name = policyName(input.name, alertType);
		const body = (base?: CfNotificationPolicy): CfNotificationPolicyInput => ({
			name,
			alert_type: alertType,
			enabled: true,
			mechanisms: {
				...base?.mechanisms,
				webhooks: withDestination(base?.mechanisms.webhooks, destination.id, duplicates),
			},
			...(base?.description !== undefined ? { description: base.description } : {}),
			...(base?.filters !== undefined ? { filters: base.filters } : {}),
			...(base?.alert_interval !== undefined ? { alert_interval: base.alert_interval } : {}),
		});
		const existing = policies.find((p) => p.name.toLowerCase() === name.toLowerCase());
		if (!existing) {
			await client.alerting.policies.create(accountId, body());
			updated.push(`policy ${alertType}`);
			continue;
		}
		const targets = existing.mechanisms.webhooks ?? [];
		const attached =
			targets.some((w) => w.id === destination.id) &&
			targets.every((w) => w.id === destination.id || !duplicates.has(w.id));
		if (existing.enabled && attached) continue;
		// PUT replaces the whole policy, so everything it already had is sent back.
		await client.alerting.policies.update(accountId, existing.id, body(existing));
		updated.push(`policy ${alertType}`);
	}
	return {
		created,
		updated: created ? [] : updated,
		...(secret ? { secret } : {}),
		...(todo.length > 0 ? { todo } : {}),
	};
}

/** Reads the webhook back without changing anything: whether the destination exists and which alert types it is sent for. */
export async function inspectRelaySource(
	client: CloudflareClient,
	accountId: string,
	input: InspectRelaySourceInput
): Promise<RelaySourceState> {
	const ids = new Set(
		(await client.alerting.webhooks.list(accountId)).filter((d) => destinationMatches(d, input)).map((d) => d.id)
	);
	if (ids.size === 0) return { exists: false };
	const policies = ownPolicies(await client.alerting.policies.list(accountId), input.name).filter((p) =>
		p.mechanisms.webhooks?.some((w) => ids.has(w.id))
	);
	// Cloudflare never says whether a destination has a secret, so `hasSecret` is left out.
	return {
		exists: true,
		enabled: policies.length > 0 && policies.every((p) => p.enabled),
		events: policies.map((p) => p.alert_type),
	};
}
