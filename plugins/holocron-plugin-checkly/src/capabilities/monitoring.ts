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

import type { Monitoring, MonitoringCheck, MonitoringCheckInput } from "@theholocron/cli";

import type { ApiCheck, ApiCheckInput, AssertionComparison, AssertionSource, ChecklyClient } from "../rest.js";

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
		request: {
			url: input.url,
			method: input.method ?? "GET",
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

	/** Checkly's `search` param is a case-insensitive partial match — narrow to the exact name ourselves. */
	private async findByExactName(name: string): Promise<ApiCheck | undefined> {
		const candidates = await this.client().checks.list({ search: name });
		return candidates.find((c) => c.name === name);
	}
}
