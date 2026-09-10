/**
 * `logs` capability for Axiom.
 *
 * This plugin does NOT ship log lines — `@theholocron/observability/logger`'s
 * Axiom transport reads `HOLOCRON_AXIOM_TOKEN` / `HOLOCRON_AXIOM_DATASET`
 * directly at startup. The `logs` capability exists solely for the
 * management surface: `holocron setup` provisions the aggregation
 * datasets (`holocron-ci`, `holocron-local`) and `holocron doctor`
 * verifies connectivity.
 *
 * `ensureDataset` is idempotent — GET the dataset, and on a 404 create
 * it; "already exists" is success.
 */

import type { Logs } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { AxiomRestClient } from "../rest.js";

export interface AxiomLogsOptions {
	/**
	 * Target dataset, resolved from `HOLOCRON_AXIOM_DATASET` /
	 * `AXIOM_DATASET`. Required for `whoami`; not needed for `describe`
	 * or `ensureDataset` (which takes an explicit name).
	 */
	dataset?: string;
}

export class AxiomLogs implements Logs {
	readonly key = "logs" as const;
	readonly providerName = "axiom";

	/**
	 * `client` is a thunk — the token is resolved on first call, so
	 * `describe()` (which needs no auth) works without one.
	 */
	constructor(
		private readonly client: () => AxiomRestClient,
		private readonly opts: AxiomLogsOptions
	) {}

	async describe() {
		return {
			provider: "axiom",
			envKeys: ["HOLOCRON_AXIOM_TOKEN", "HOLOCRON_AXIOM_DATASET"],
		};
	}

	async whoami(): Promise<{ ok: boolean; dataset: string }> {
		const dataset = this.opts.dataset;
		if (!dataset) {
			throw new Error(
				"@theholocron/holocron-plugin-axiom needs a dataset (HOLOCRON_AXIOM_DATASET / AXIOM_DATASET) for whoami"
			);
		}
		// Fetching the dataset verifies both the token and the dataset's reachability.
		await this.client().getDataset(dataset);
		return { ok: true, dataset };
	}

	async ensureDataset(name: string): Promise<{ alreadyExists: boolean }> {
		try {
			await this.client().getDataset(name);
			return { alreadyExists: true };
		} catch (err) {
			// 404 means the dataset doesn't exist yet — proceed to create.
			if (!(err instanceof ProviderApiError) || err.status !== 404) throw err;
		}

		await this.client().createDataset({ name, description: "Managed by holocron" });
		return { alreadyExists: false };
	}
}
