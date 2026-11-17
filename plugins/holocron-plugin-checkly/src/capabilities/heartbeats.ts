/**
 * Heartbeats for the Checkly `monitoring` provider: find-or-create-or-update by exact name, never deleting.
 *
 * Checkly lists heartbeats beside every other check and returns the ping URL on every read, not only on create, so
 * `ensureHeartbeat` hands the URL back whether the heartbeat was made or found. The URL is a credential: nothing here
 * logs it or puts it in an error message.
 */

import type { MonitoringHeartbeatInput, MonitoringHeartbeatResult } from "@theholocron/cli";

import type { ChecklyClient, Heartbeat, HeartbeatInput } from "../rest.js";

const PAGE = 100;

/** A heartbeat as Checkly holds it, in the shape `heartbeats` declares them. The ping URL is never part of it. */
export function fromChecklyHeartbeat(h: Heartbeat): MonitoringHeartbeatInput {
	return {
		name: h.name,
		period: h.heartbeat.period,
		periodUnit: h.heartbeat.periodUnit,
		grace: h.heartbeat.grace,
		graceUnit: h.heartbeat.graceUnit,
		tags: h.tags ?? [],
	};
}

/** The request body: the settings the config states, and, on an existing heartbeat, its own ping token so its URL holds. */
function payload(input: MonitoringHeartbeatInput, existing?: Heartbeat): HeartbeatInput {
	return {
		name: input.name,
		...(input.tags !== undefined ? { tags: input.tags } : {}),
		heartbeat: {
			period: input.period,
			periodUnit: input.periodUnit,
			grace: input.grace,
			graceUnit: input.graceUnit,
			...(existing?.heartbeat.pingToken ? { pingToken: existing.heartbeat.pingToken } : {}),
		},
	};
}

function differs(input: MonitoringHeartbeatInput, h: Heartbeat): boolean {
	const have = h.heartbeat;
	if (
		have.period !== input.period ||
		have.periodUnit !== input.periodUnit ||
		have.grace !== input.grace ||
		have.graceUnit !== input.graceUnit
	) {
		return true;
	}
	if (input.tags === undefined) return false;
	const a = [...input.tags].sort().join("\n");
	const b = [...(h.tags ?? [])].sort().join("\n");
	return a !== b;
}

/** Find the heartbeat named `input.name` and bring it in line, or make it. A field the config leaves out is left alone. */
export async function ensureChecklyHeartbeat(
	client: ChecklyClient,
	input: MonitoringHeartbeatInput
): Promise<MonitoringHeartbeatResult> {
	const candidates = await client.heartbeats.list({ search: input.name, limit: PAGE });
	const existing = candidates.find((h) => h.name === input.name);
	if (!existing) {
		const created = await client.heartbeats.create(payload(input));
		return result(created, false);
	}
	const current = differs(input, existing)
		? await client.heartbeats.update(existing.id, payload(input, existing))
		: existing;
	return result(current, true);
}

function result(h: Heartbeat, alreadyExists: boolean): MonitoringHeartbeatResult {
	return {
		heartbeat: { id: h.id, name: h.name },
		alreadyExists,
		...(h.heartbeat.pingUrl ? { pingUrl: h.heartbeat.pingUrl } : {}),
	};
}
