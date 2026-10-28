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

/**
 * A provider could not finish an edit because the bot lacks a permission it should not keep. Carries what a person
 * needs to give it for one run and take it away again, so `setup` can walk them through it.
 */
export class ElevationRequiredError extends Error {
	override name = "ElevationRequiredError";
	constructor(
		message: string,
		readonly elevation: {
			/** The permission, in the provider's own name for it. */
			permission: string;
			/** Where to approve giving it; absent when the provider could not build one. */
			grantUrl?: string;
			/** Where to approve taking it away again; absent when the provider could not build one. */
			revokeUrl?: string;
			/** A name for the permission a person would recognise, when {@link permission} is the provider's code for it. */
			label?: string;
			/** The permission is meant to stay once given: there is nothing to take away afterwards. */
			keep?: boolean;
			/** What the edit had already changed before it was refused, so a retry does not hide it from the summary. */
			applied?: string[];
		},
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

export class WebhookVerificationError extends Error {
	override name = "WebhookVerificationError";
}

export function isMulti<K extends CapabilityKey>(key: K): CardinalityFor<K> extends "many" ? true : false {
	return (CARDINALITY[key] === "many") as CardinalityFor<K> extends "many" ? true : false;
}
