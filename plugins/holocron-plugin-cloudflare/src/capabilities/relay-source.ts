import type {
	EnsureRelaySourceInput,
	EnsureRelaySourceResult,
	InspectRelaySourceInput,
	RelaySourceState,
} from "@theholocron/cli";
import type { CfNotificationPolicy, CfNotificationPolicyInput } from "@theholocron/cloudflare-client";

import type { CloudflareClient } from "../rest.js";

/** The name of the policy that sends one alert type to the relay: the source's name, then the alert type. */
export function policyName(name: string, alertType: string): string {
	return `${name}: ${alertType}`;
}

/** The webhook targets of a policy with the destination in them, once. */
function withDestination(webhooks: Array<{ id: string }> = [], id: string): Array<{ id: string }> {
	return webhooks.some((w) => w.id === id) ? webhooks : [...webhooks, { id }];
}

/** The policies that belong to a source, found by name, one per alert type of its layout. */
function ownPolicies(policies: CfNotificationPolicy[], name: string): CfNotificationPolicy[] {
	const prefix = `${name}: `;
	return policies.filter((p) => p.name.startsWith(prefix));
}

/**
 * Makes the Cloudflare notification webhook for a relay source (spec `tech-relay-sources`). A destination alone sends
 * nothing, so each alert type of `events` gets a policy of its own that names the destination. The destination is
 * found by URL and each policy by name; nothing is deleted. The secret the caller offers is set only when the
 * destination is made (Cloudflare never returns it), so it is returned only then.
 */
export async function ensureRelaySource(
	client: CloudflareClient,
	accountId: string,
	input: EnsureRelaySourceInput
): Promise<EnsureRelaySourceResult> {
	const updated: string[] = [];
	const destinations = await client.alerting.webhooks.list(accountId);
	let found = destinations.find((d) => d.url === input.url);
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

	const events = input.events ?? [];
	if (events.length === 0) {
		const todo = [
			`List the Cloudflare alert types to send in the source's \`events\` (GET /accounts/<id>/alerting/v3/available_alerts names them); a webhook with no policy sends nothing.`,
		];
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
				webhooks: withDestination(base?.mechanisms.webhooks, destination.id),
			},
			...(base?.description !== undefined ? { description: base.description } : {}),
			...(base?.filters !== undefined ? { filters: base.filters } : {}),
			...(base?.alert_interval !== undefined ? { alert_interval: base.alert_interval } : {}),
		});
		const existing = policies.find((p) => p.name === name);
		if (!existing) {
			await client.alerting.policies.create(accountId, body());
			updated.push(`policy ${alertType}`);
			continue;
		}
		const attached = existing.mechanisms.webhooks?.some((w) => w.id === destination.id) ?? false;
		if (existing.enabled && attached) continue;
		// PUT replaces the whole policy, so everything it already had is sent back.
		await client.alerting.policies.update(accountId, existing.id, body(existing));
		updated.push(`policy ${alertType}`);
	}
	return {
		created,
		updated: created ? [] : updated,
		...(secret ? { secret } : {}),
	};
}

/** Reads the webhook back without changing anything: whether the destination exists and which alert types it is sent for. */
export async function inspectRelaySource(
	client: CloudflareClient,
	accountId: string,
	input: InspectRelaySourceInput
): Promise<RelaySourceState> {
	const destination = (await client.alerting.webhooks.list(accountId)).find((d) => d.url === input.url);
	if (!destination) return { exists: false };
	const policies = ownPolicies(await client.alerting.policies.list(accountId), input.name).filter((p) =>
		p.mechanisms.webhooks?.some((w) => w.id === destination.id)
	);
	// Cloudflare never says whether a destination has a secret, so `hasSecret` is left out.
	return {
		exists: true,
		enabled: policies.length > 0 && policies.every((p) => p.enabled),
		events: policies.map((p) => p.alert_type),
	};
}
