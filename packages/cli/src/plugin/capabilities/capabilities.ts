import type { CapabilityKey, Cardinality, CardinalityFor } from "./capabilities.type.js";

export const CARDINALITY = {
	source: "single",
	ci: "single",
	secrets: "single",
	environments: "single",
	issues: "single",
	deployment: "single",
	storage: "single",
	auth: "single",
	vault: "single",
	dns: "single",
	tooling: "many",
	notifications: "many",
	analytics: "many",
	errors: "single",
	logs: "single",
	monitoring: "single",
	wiki: "single",
	workers: "single",
} as const satisfies Record<CapabilityKey, Cardinality>;

/**
 * No capabilities are strictly required — repos without secrets (e.g. org
 * community health repos) legitimately omit vault. Plugins validate their
 * own requirements at call time.
 */
export const REQUIRED_CAPABILITIES: readonly CapabilityKey[] = [] as const;

export { ProviderApiError } from "@theholocron/http-client";

export class WebhookVerificationError extends Error {
	override name = "WebhookVerificationError";
}

export function isMulti<K extends CapabilityKey>(key: K): CardinalityFor<K> extends "many" ? true : false {
	return (CARDINALITY[key] === "many") as CardinalityFor<K> extends "many" ? true : false;
}
