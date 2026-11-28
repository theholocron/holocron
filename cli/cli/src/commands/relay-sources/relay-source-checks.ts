import { describeError, sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { missingTokenReason } from "../missing-token/index.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { declaredRelaySources } from "./declared-relay-sources.js";
import type { RelaySourceChecksInput } from "./relay-sources.type.js";

const shown = (s: string) => sanitizeDetail(s);
const missingFrom = (wanted: string[] | undefined, held: string[] | undefined): string[] =>
	wanted && held ? wanted.filter((w) => !held.includes(w)) : [];

/**
 * The steps of `doctor notifications` that check each relay source's webhook at the vendor (`relay-source:<id>`): it
 * exists for the relay's URL, is on, and carries every event and scope the layout declares (extra ones are left alone).
 * Read-only, and the signing secret is never read. No rows unless the layout declares `relay.sources`; a provider that
 * is missing, cannot read its webhook or has no token is a skip, never a failure.
 */
export async function relaySourceChecks(input: RelaySourceChecksInput): Promise<NotificationsCheck[]> {
	const { layout } = input;
	const host = layout.relay?.host;
	const rows: NotificationsCheck[] = [];
	for (const source of declaredRelaySources(layout)) {
		const { id, spec } = source;
		const rowId = `relay-source:${id}`;
		const title = `${shown(id)} webhook at the vendor posts to the relay`;
		if (!host) {
			rows.push(skipRow(rowId, title, "no `relay.host` is declared"));
			continue;
		}
		const { provider, problem } = await input.resolve(source);
		if (!provider) {
			rows.push(skipRow(rowId, title, problem!));
			continue;
		}
		if (!provider.inspectRelaySource) {
			rows.push(skipRow(rowId, title, `the \`${provider.providerName}\` provider cannot read its webhooks`));
			continue;
		}
		const url = `https://${host}/${id}`;
		try {
			const state = await provider.inspectRelaySource({
				source: id,
				url,
				name: spec.name ?? id.charAt(0).toUpperCase() + id.slice(1),
				...(spec.events ? { events: spec.events } : {}),
				...(spec.scope ? { scope: spec.scope } : {}),
				...(spec.options ? { options: spec.options } : {}),
			});
			const problems: string[] = [];
			if (!state.exists) {
				problems.push(`no ${shown(provider.providerName)} webhook posts to ${shown(url)}`);
			} else {
				if (state.enabled === false) problems.push("the webhook is switched off");
				const events = missingFrom(spec.events, state.events);
				if (events.length > 0) problems.push(`not subscribed to ${events.map(shown).join(", ")}`);
				const scope = missingFrom(spec.scope, state.scope);
				if (scope.length > 0) problems.push(`does not cover ${scope.map(shown).join(", ")}`);
				if (state.hasSecret === false) problems.push("the webhook has no signing secret");
			}
			rows.push(resultRow(rowId, title, problems, `${shown(provider.providerName)} posts to ${shown(url)}`));
		} catch (err) {
			const noToken = missingTokenReason(err);
			rows.push(
				noToken !== undefined
					? skipRow(rowId, title, noToken)
					: resultRow(rowId, title, [shown(describeError(err))], "")
			);
		}
	}
	return rows;
}
