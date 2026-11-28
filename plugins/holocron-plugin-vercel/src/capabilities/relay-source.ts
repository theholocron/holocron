/**
 * The Vercel side of a Comlink relay source (spec `tech-relay-sources`): one team webhook for the relay's URL.
 *
 * Vercel returns the signing secret only in the create response, lists webhooks without it, and (in the reference read
 * 2026-11-19) has no update call, so an adopted webhook is never changed and the doctor reports a difference.
 */

import type {
	EnsureRelaySourceInput,
	EnsureRelaySourceResult,
	InspectRelaySourceInput,
	RelaySourceState,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { VercelClient, VercelWebhook } from "@theholocron/vercel-client";

async function findByUrl(client: VercelClient, url: string): Promise<VercelWebhook | undefined> {
	const all = await client.webhooks.list();
	return all.find((w) => w.url === url);
}

/** Make the webhook for `input.url`, or adopt the one already there. Returns the secret only when it was made now. */
export async function ensureVercelRelaySource(
	client: VercelClient,
	input: EnsureRelaySourceInput
): Promise<EnsureRelaySourceResult> {
	const existing = await findByUrl(client, input.url);
	if (existing) return { created: false, updated: [] };

	if (!input.events || input.events.length === 0) {
		return {
			created: false,
			updated: [],
			todo: [
				`Vercel needs at least one event to make a webhook: set \`events\` on relay.sources.${input.source}.`,
			],
		};
	}

	try {
		const made = await client.webhooks.create({
			url: input.url,
			events: input.events,
			...(input.scope && input.scope.length > 0 ? { projectIds: input.scope } : {}),
		});
		return { created: true, updated: [], ...(made.secret ? { secret: made.secret } : {}) };
	} catch (err) {
		if (err instanceof ProviderApiError && (err.status === 402 || err.status === 403)) {
			return {
				created: false,
				updated: [],
				todo: [
					`Vercel refused to make the webhook (HTTP ${err.status}): account webhooks need a Pro or Enterprise team and a token for that team. Make it in Team Settings, Webhooks, for ${input.url}.`,
				],
			};
		}
		throw err;
	}
}

/** Read the webhook for `input.url` back. Vercel's list carries no secret, so `hasSecret` is left out. */
export async function inspectVercelRelaySource(
	client: VercelClient,
	input: InspectRelaySourceInput
): Promise<RelaySourceState> {
	const found = await findByUrl(client, input.url);
	if (!found) return { exists: false };
	return { exists: true, events: found.events, scope: found.projectIds ?? [] };
}
