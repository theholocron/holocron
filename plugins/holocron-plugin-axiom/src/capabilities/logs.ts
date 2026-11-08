/**
 * `logs` capability for Axiom.
 *
 * This plugin does NOT ship log lines — `@theholocron/observability/logger`'s
 * Axiom transport reads `HOLOCRON_AXIOM_TOKEN` / `HOLOCRON_AXIOM_DATASET`
 * directly at startup. The `logs` capability exists solely for the
 * management surface: `holocron repo setup` provisions the CLI's aggregation
 * dataset (`holocron`, shared by every environment of the CLI) and `holocron doctor`
 * verifies connectivity.
 *
 * `ensureDataset` is idempotent — GET the dataset, and on a 404 create
 * it; "already exists" is success.
 */

import type { Logs, LogsDataset } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { AxiomClient } from "../rest.js";

/** A dataset that does not exist: asking for it tells a token Axiom accepts (404) from one it refuses (401). */
const PROBE_DATASET = "holocron-token-check";

/** Options for the Axiom `logs` capability. */
export interface AxiomLogsOptions {
	/**
	 * Target dataset, resolved from `HOLOCRON_AXIOM_DATASET` /
	 * `AXIOM_DATASET`. Required for `whoami`; not needed for `describe`
	 * or `ensureDataset` (which takes an explicit name).
	 */
	dataset?: string;
}

/** The `logs` capability for Axiom: checks a dataset is reachable and creates datasets that are missing. */
export class AxiomLogs implements Logs {
	/** The capability key, always `logs`. */
	readonly key = "logs" as const;
	/** The provider name, `axiom`. */
	readonly providerName = "axiom";

	/**
	 * `client` is a thunk — the token is resolved on first call, so
	 * `describe()` (which needs no auth) works without one.
	 */
	constructor(
		private readonly client: () => AxiomClient,
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
		await this.client().datasets.get(dataset);
		return { ok: true, dataset };
	}

	async readDataset(name: string): Promise<LogsDataset> {
		try {
			const found = await this.client().datasets.get(name);
			// `useRetentionPeriod: false` means the days do not apply, so none is reported.
			const days = found.useRetentionPeriod === false ? undefined : found.retentionDays;
			return { exists: true, ...(days === undefined ? {} : { retentionDays: days }) };
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) return { exists: false };
			throw err;
		}
	}

	async checkToken(): Promise<{ ok: boolean; reason?: string }> {
		try {
			await this.client().datasets.get(PROBE_DATASET);
			return { ok: true };
		} catch (err) {
			if (err instanceof ProviderApiError) {
				if (err.status === 404) return { ok: true };
				if (err.status === 401) return { ok: false, reason: "Axiom refused the token (401)" };
			}
			throw err;
		}
	}

	async ensureDataset(name: string): Promise<{ alreadyExists: boolean }> {
		try {
			await this.client().datasets.get(name);
			return { alreadyExists: true };
		} catch (err) {
			// 404 means the dataset doesn't exist yet — proceed to create.
			if (!(err instanceof ProviderApiError) || err.status !== 404) throw err;
		}

		await this.client().datasets.create({ name, description: "Managed by holocron" });
		return { alreadyExists: false };
	}
}
